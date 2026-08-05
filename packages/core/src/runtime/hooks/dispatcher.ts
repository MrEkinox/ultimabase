import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { isDeepStrictEqual } from 'node:util'

import { hydrateQueryFromAst, Query } from '../../query/query/query.js'
import type {
	ExecutableOperationAst,
	QueryAst,
	QueryFilterNode,
	QueryFieldName,
} from '../../query/index.js'
import type { FieldHookPhase } from '../../schema/hooks/field-declarations.js'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type { HookContext } from '../../schema/hooks/hook-context.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { PluginDefinition } from '../../foundation.js'
import { FrameworkApplication } from '../../foundation.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type {
	RuntimeNativeDatabaseResultStageInput,
	RuntimeNativeHookStages,
	RuntimeNativeResultStageInput,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
} from '../pipeline/contracts.js'
import {
	createRuntimeHookBoundaries,
	type RuntimeHookBoundaries,
} from './boundaries.js'
import {
	compileNativeHookContributionPlan,
	type NativeHookContributionPlan,
} from './contribution-plan.js'
import {
	collectNestedHookHandlers,
	createSchemaOperationHookInput,
	invokeErasedHook,
	requireDeclaredOperationSchema,
} from './contribution-execution.js'
import {
	collectOperationFieldInputs,
	transformOperationFieldInputs,
} from './field-inputs.js'
import { transformOperationFieldOutputs } from './field-outputs.js'
import {
	collectMutationAfterFieldValues,
	collectMutationBeforeFieldValues,
	collectMutationFieldChanges,
} from './materializations.js'
import { getNativeHookPhaseOrder } from './phase-order.js'
import {
	runHookEffects,
	runHookTransformChain,
	runHookValidations,
} from './composition.js'
import {
	createTransactionHookLifecycle,
	runNonTransactionalErrorHooks,
} from './transaction-dispatcher.js'
import {
	createFieldHookTarget,
	createSchemaHookTarget,
	type HookExecutionDescriptor,
} from './execution-descriptor.js'
import {
	getApplicationHookExecutionRuntime,
	type HookExecutionRuntime,
} from './execution-runtime.js'

const createSchemaResultInput = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	context: HookContext,
): Readonly<{
	readonly context: HookContext
	readonly kind: TOperation['kind']
	readonly operation: TOperation
	readonly result: RuntimeOperationResult<TOperation>
}> => immutableRecord({ context, kind: operation.kind, operation, result })

type RuntimeReadOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: 'count' | 'exists' | 'find' | 'first' | 'get' }
>

const readQueryAst = (operation: DatabaseOperationAst): QueryAst => {
	const executable = operation as unknown as ExecutableOperationAst

	switch (executable.kind) {
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
		case 'get':
			return executable.query
		case 'create-many':
		case 'create-one':
		case 'delete-many':
		case 'delete-one':
		case 'update-many':
		case 'update-one':
		case 'upsert-many':
		case 'upsert-one':
			throw new TypeError('beforeRead requires a read operation')
	}
}

const hasSameSelection = (left: QueryAst, right: QueryAst): boolean =>
	left.selection.fields.length === right.selection.fields.length &&
	left.selection.fields.every(
		(selected, index) =>
			selected.field === right.selection.fields[index]?.field,
	)

/** Prevents a read hook from invalidating the inclusion encoded in its result type. */
const hasSameInclusion = (left: QueryAst, right: QueryAst): boolean =>
	isDeepStrictEqual(left.inclusion, right.inclusion)

/** Recovers the builder's normalized filter specialization at the Runtime seam. */
const hydrateRuntimeQuery = (
	ast: QueryAst,
): Query<SchemaDefinition, QueryFieldName<SchemaDefinition>> =>
	// Executable operations can erase their schema-specific filter union, but the
	// pipeline accepts only Query-produced and structurally normalized AST nodes.
	hydrateQueryFromAst(
		ast as QueryAst<SchemaDefinition, QueryFilterNode<SchemaDefinition>>,
	)

/** Narrows an erased callback result without leaking Query's constructor defaults. */
const isRuntimeQuery = (
	value: unknown,
): value is Query<SchemaDefinition, QueryFieldName<SchemaDefinition>> =>
	value instanceof Query

/** Lets read hooks replace builder state without changing schema or projection. */
const runBeforeRead = async <const TOperation extends DatabaseOperationAst>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const schemaPlan = plan.getSchema(
		requireDeclaredOperationSchema(input.operation),
	)

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const handlers = collectNestedHookHandlers(
		schemaPlan.contributions,
		'before',
		'beforeRead',
		input.operation.kind,
		createSchemaHookTarget(schemaPlan.schema.className),
		'read',
	)

	return runHookTransformChain(
		handlers,
		input.operation,
		async (handler, current) => {
			const currentAst = readQueryAst(current)
			const query = hydrateRuntimeQuery(currentAst)
			const replacement = await invokeErasedHook<unknown>(
				runtime,
				handler,
				input.context,
				(context) =>
					immutableRecord({
						context,
						kind: current.kind,
						operation: current,
						query,
					}),
			)

			if (replacement === undefined) {
				return undefined
			}

			if (!isRuntimeQuery(replacement)) {
				throw new TypeError('beforeRead must return an immutable Query')
			}

			if (replacement.schema !== query.schema) {
				throw new TypeError('beforeRead must retain the exact schema')
			}

			if (!hasSameSelection(currentAst, replacement.ast)) {
				throw new TypeError('beforeRead must retain the exact query selection')
			}

			if (!hasSameInclusion(currentAst, replacement.ast)) {
				throw new TypeError('beforeRead must retain the exact query inclusion')
			}

			const readOperation = current as unknown as RuntimeReadOperation
			const nextOperation = immutableRecord({
				...readOperation,
				query: replacement.ast,
			})

			return boundaries.snapshotOperationReplacement(current, nextOperation)
		},
	)
}

/** Resolves each readable present output through its field contribution chain. */
const resolveFieldOutputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeNativeDatabaseResultStageInput<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	const schema = requireDeclaredOperationSchema(input.operation)
	const family = getNativeHookPhaseOrder(input.operation.kind).family

	return transformOperationFieldOutputs(
		input.operation,
		input.result,
		async (fieldOutput) => {
			const fieldPlan = plan.getField(schema, fieldOutput.fieldPath)

			if (fieldPlan === undefined) {
				return undefined
			}

			const handlers = collectNestedHookHandlers(
				fieldPlan.contributions,
				'after',
				'resolveOutput',
				input.operation.kind,
				createFieldHookTarget(schema.className, fieldOutput.fieldPath),
				family,
			)

			return runHookTransformChain(
				handlers,
				fieldOutput.value,
				(handler, value) =>
					invokeErasedHook(runtime, handler, input.context, (context) =>
						immutableRecord({
							context,
							kind: fieldOutput.kind,
							mode: fieldOutput.mode,
							value,
						}),
					),
			)
		},
	)
}

const resolveFieldInputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const { operation } = input
	const order = getNativeHookPhaseOrder(operation.kind)
	const schema = requireDeclaredOperationSchema(operation)

	return transformOperationFieldInputs(operation, async (fieldInput) => {
		const fieldPlan = plan.getField(schema, fieldInput.fieldPath)

		if (fieldPlan === undefined) {
			return undefined
		}

		const handlers = collectNestedHookHandlers(
			fieldPlan.contributions,
			'before',
			'resolveInput',
			operation.kind,
			createFieldHookTarget(schema.className, fieldInput.fieldPath),
			order.family,
		)

		return runHookTransformChain(handlers, fieldInput.value, (handler, value) =>
			invokeErasedHook(runtime, handler, input.context, (context) =>
				immutableRecord({
					context,
					kind: fieldInput.kind,
					mode: fieldInput.mode,
					value,
				}),
			),
		)
	})
}

const runSchemaTransformPhases = async <
	const TOperation extends DatabaseOperationAst,
>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
	phases: readonly SchemaHookPhase[],
	direction: 'after' | 'before',
): Promise<TOperation> => {
	const schemaPlan = plan.getSchema(
		requireDeclaredOperationSchema(input.operation),
	)

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const family = getNativeHookPhaseOrder(input.operation.kind).family
	let operation: TOperation = input.operation

	for (const phase of phases) {
		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			direction,
			phase,
			input.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			family,
		)

		operation = await runHookTransformChain(
			handlers,
			operation,
			async (handler, current) => {
				const replacement = await invokeErasedHook<unknown>(
					runtime,
					handler,
					input.context,
					(context) => createSchemaOperationHookInput(current, context),
				)

				return replacement === undefined
					? undefined
					: boundaries.snapshotOperationReplacement(current, replacement)
			},
		)
	}

	return operation
}

const runSchemaBeforePhases = async <
	const TOperation extends DatabaseOperationAst,
>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)
	let operation = input.operation

	for (const phase of order.schemaBefore) {
		operation =
			phase === 'beforeRead'
				? await runBeforeRead(
						boundaries,
						plan,
						runtime,
						immutableRecord({ ...input, operation }),
					)
				: await runSchemaTransformPhases(
						boundaries,
						plan,
						runtime,
						immutableRecord({ ...input, operation }),
						immutableArray([phase]),
						'before',
					)
	}

	return operation
}

const resolveInput = async <const TOperation extends DatabaseOperationAst>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)

	if (order.family === 'delete' || order.family === 'read') {
		return input.operation
	}

	const fieldResolved = await resolveFieldInputs(plan, runtime, input)

	return runSchemaTransformPhases(
		boundaries,
		plan,
		runtime,
		immutableRecord({ ...input, operation: fieldResolved }),
		immutableArray(['resolveInput']),
		'before',
	)
}

const validateInput = async <const TOperation extends DatabaseOperationAst>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<void> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)

	if (order.family === 'delete' || order.family === 'read') {
		return
	}

	const schema = requireDeclaredOperationSchema(input.operation)
	const issues = []

	for (const fieldInput of collectOperationFieldInputs(
		input.operation,
		'children-first',
	)) {
		const fieldPlan = plan.getField(schema, fieldInput.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		const handlers = collectNestedHookHandlers(
			fieldPlan.contributions,
			'before',
			'validate',
			input.operation.kind,
			createFieldHookTarget(schema.className, fieldInput.fieldPath),
			order.family,
		)
		const fieldIssues = await runHookValidations(handlers, (handler) =>
			invokeErasedHook(runtime, handler, input.context, (context) =>
				immutableRecord({
					context,
					kind: fieldInput.kind,
					mode: fieldInput.mode,
					value: fieldInput.value,
				}),
			),
		)

		for (const issue of fieldIssues) {
			issues.push(
				immutableRecord({
					...issue,
					path: immutableArray([...fieldInput.valuePath, ...issue.path]),
				}),
			)
		}
	}

	const schemaPlan = plan.getSchema(schema)

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const schemaHandlers = collectNestedHookHandlers(
		schemaPlan.contributions,
		'before',
		'validate',
		input.operation.kind,
		createSchemaHookTarget(schema.className),
		order.family,
	)
	issues.push(
		...(await runHookValidations(schemaHandlers, (handler) =>
			invokeErasedHook(runtime, handler, input.context, (context) =>
				createSchemaOperationHookInput(input.operation, context),
			),
		)),
	)

	boundaries.throwHookValidationIssues(issues)
}

/** Executes one erased effect while preserving both sync and async handlers. */
const invokeErasedEffect = async (
	runtime: HookExecutionRuntime,
	handler: HookExecutionDescriptor,
	request: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
	createInput: (context: HookContext) => unknown,
): Promise<void> => {
	await invokeErasedHook(runtime, handler, request, createInput)
}

const runMutationFieldEffects = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
	operation: DatabaseMutationOperationAst,
	values: ReturnType<typeof collectMutationBeforeFieldValues>,
	phases: readonly FieldHookPhase[],
	direction: 'after' | 'before',
): Promise<void> => {
	const schema = requireDeclaredOperationSchema(operation)
	const family = getNativeHookPhaseOrder(operation.kind).family

	for (const value of values) {
		const fieldPlan = plan.getField(schema, value.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		for (const phase of phases) {
			const handlers = collectNestedHookHandlers(
				fieldPlan.contributions,
				direction,
				phase,
				operation.kind,
				createFieldHookTarget(schema.className, value.fieldPath),
				family,
			)

			await runHookEffects(handlers, (handler) =>
				invokeErasedEffect(runtime, handler, context, (hookContext) =>
					immutableRecord({
						context: hookContext,
						kind: value.kind,
						mode: value.mode,
						value: value.value,
					}),
				),
			)
		}
	}
}

const runChangeEffects = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
	operation: TOperation,
	outcome: DatabaseOperationOutcome<TOperation>,
): Promise<void> => {
	const schema = requireDeclaredOperationSchema(operation)
	const family = getNativeHookPhaseOrder(operation.kind).family

	for (const change of collectMutationFieldChanges(operation, outcome)) {
		const fieldPlan = plan.getField(schema, change.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		const handlers = collectNestedHookHandlers(
			fieldPlan.contributions,
			'after',
			'onChange',
			operation.kind,
			createFieldHookTarget(schema.className, change.fieldPath),
			family,
		)

		await runHookEffects(handlers, (handler) =>
			invokeErasedEffect(runtime, handler, context, (hookContext) =>
				immutableRecord({
					context: hookContext,
					change: change.change,
					itemId: change.itemId,
					kind: change.kind,
					timing: change.timing,
				}),
			),
		)
	}
}

const runSchemaResultPhases = async <
	const TOperation extends DatabaseOperationAst,
>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeNativeResultStageInput<TOperation>,
): Promise<RuntimeOperationResult<TOperation>> => {
	const schemaPlan = plan.getSchema(
		requireDeclaredOperationSchema(input.operation),
	)

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const order = getNativeHookPhaseOrder(input.operation.kind)
	let result = boundaries.snapshotResultReplacement(
		input.operation,
		input.result,
		input.selectedFieldsOverride,
	)

	for (const phase of order.schemaAfter) {
		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			phase,
			input.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			order.family,
		)

		result = await runHookTransformChain(
			handlers,
			result,
			async (handler, current) => {
				const replacement = await invokeErasedHook<unknown>(
					runtime,
					handler,
					input.context,
					(context) =>
						createSchemaResultInput(input.operation, current, context),
				)

				return replacement === undefined
					? undefined
					: boundaries.snapshotResultReplacement(
							input.operation,
							replacement,
							input.selectedFieldsOverride,
						)
			},
		)
	}

	return result
}

/** Compiles native declarations into the seven fixed Runtime pipeline stages. */
export const createNativeHookStages = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): RuntimeNativeHookStages => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError('Native hook stages require a FrameworkApplication')
	}

	const plan = compileNativeHookContributionPlan(application)
	const boundaries = createRuntimeHookBoundaries()
	const runtime = getApplicationHookExecutionRuntime(application)

	return immutableRecord({
		createTransactionLifecycle: () =>
			createTransactionHookLifecycle(plan, runtime),
		fieldAfter: async (input) => {
			const outcome = boundaries.snapshotMutationOutcome(
				input.operation,
				input.outcome,
			)
			const order = getNativeHookPhaseOrder(input.operation.kind)

			await runMutationFieldEffects(
				plan,
				runtime,
				input.context,
				input.operation,
				collectMutationAfterFieldValues(input.operation, outcome),
				order.fieldAfter,
				'after',
			)
			await runChangeEffects(
				plan,
				runtime,
				input.context,
				input.operation,
				outcome,
			)

			return outcome
		},
		fieldBefore: async (input) => {
			const order = getNativeHookPhaseOrder(input.operation.kind)

			await runMutationFieldEffects(
				plan,
				runtime,
				input.context,
				input.operation,
				collectMutationBeforeFieldValues(input.operation, input.target),
				order.fieldBefore,
				'before',
			)
		},
		onError: (input) => runNonTransactionalErrorHooks(plan, runtime, input),
		resolveInput: (input) => resolveInput(boundaries, plan, runtime, input),
		resolveOutput: (input) => resolveFieldOutputs(plan, runtime, input),
		revalidate: (input) =>
			boundaries.snapshotOperationReplacement(input.operation, input.operation),
		schemaAfter: (input) =>
			runSchemaResultPhases(boundaries, plan, runtime, input),
		schemaBefore: (input) => {
			return runSchemaBeforePhases(boundaries, plan, runtime, input)
		},
		validate: (input) => validateInput(boundaries, plan, runtime, input),
	})
}

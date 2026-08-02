import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	getHookHandlers,
	type ErasedHookHandler,
	type NormalizedHookDeclarations,
} from '../../schema/hooks/normalization.js'
import type { FieldHookPhase } from '../../schema/hooks/field-declarations.js'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { PluginDefinition } from '../../foundation.js'
import { FrameworkApplication } from '../../foundation.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeNativeHookStages,
	RuntimeOperationStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import {
	createRuntimeHookBoundaries,
	type RuntimeHookBoundaries,
} from './boundaries.js'
import {
	compileNativeHookContributionPlan,
	type HookContribution,
	type HookContributionNesting,
	type NativeHookContributionPlan,
} from './contribution-plan.js'
import {
	collectOperationFieldInputs,
	transformOperationFieldInputs,
} from './field-inputs.js'
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

/** Reads one exact application schema before dispatching identity-owned hooks. */
const requireOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Native hook dispatch requires a declared schema')
	}

	return schema
}

/** Flattens only the current phase while retaining compiled contribution order. */
const collectContributionHandlers = <TPhase extends string>(
	contributions: readonly HookContribution<
		NormalizedHookDeclarations<TPhase>
	>[],
	phase: TPhase,
	family: string,
): readonly ErasedHookHandler[] => {
	const handlers: ErasedHookHandler[] = []

	for (const contribution of contributions) {
		handlers.push(...getHookHandlers(contribution.declarations, phase, family))
	}

	return immutableArray(handlers)
}

const collectNestedHandlers = <TPhase extends string>(
	nesting: HookContributionNesting<NormalizedHookDeclarations<TPhase>>,
	direction: 'after' | 'before',
	phase: TPhase,
	family: string,
): readonly ErasedHookHandler[] =>
	collectContributionHandlers(nesting[direction], phase, family)

/** Invokes a callback only after its public declaration was type-checked. */
const invokeErasedHook = (
	handler: ErasedHookHandler,
	input: unknown,
): MaybePromise<unknown> => handler(input as never)

const createSchemaOperationInput = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
): Readonly<{
	readonly kind: TOperation['kind']
	readonly operation: TOperation
}> => immutableRecord({ kind: operation.kind, operation })

const createSchemaResultInput = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
): Readonly<{
	readonly kind: TOperation['kind']
	readonly operation: TOperation
	readonly result: DatabaseOperationResult<TOperation>
}> => immutableRecord({ kind: operation.kind, operation, result })

const resolveFieldInputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	plan: NativeHookContributionPlan,
	operation: TOperation,
): Promise<TOperation> => {
	const order = getNativeHookPhaseOrder(operation.kind)
	const schema = requireOperationSchema(operation)

	return transformOperationFieldInputs(operation, async (fieldInput) => {
		const fieldPlan = plan.getField(schema, fieldInput.fieldPath)

		if (fieldPlan === undefined) {
			return undefined
		}

		const handlers = collectNestedHandlers(
			fieldPlan.contributions,
			'before',
			'resolveInput',
			order.family,
		)

		return runHookTransformChain(handlers, fieldInput.value, (handler, value) =>
			invokeErasedHook(
				handler,
				immutableRecord({
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
	input: RuntimeOperationStageInput<TOperation>,
	phases: readonly SchemaHookPhase[],
	direction: 'after' | 'before',
): Promise<TOperation> => {
	const schemaPlan = plan.getSchema(requireOperationSchema(input.operation))

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const family = getNativeHookPhaseOrder(input.operation.kind).family
	let operation: TOperation = input.operation

	for (const phase of phases) {
		const handlers = collectNestedHandlers(
			schemaPlan.contributions,
			direction,
			phase,
			family,
		)

		operation = await runHookTransformChain(
			handlers,
			operation,
			async (handler, current) => {
				const replacement = await invokeErasedHook(
					handler,
					createSchemaOperationInput(current),
				)

				return replacement === undefined
					? undefined
					: boundaries.snapshotOperationReplacement(current, replacement)
			},
		)
	}

	return operation
}

const resolveInput = async <const TOperation extends DatabaseOperationAst>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)

	if (order.family === 'delete' || order.family === 'find') {
		return input.operation
	}

	const fieldResolved = await resolveFieldInputs(plan, input.operation)

	return runSchemaTransformPhases(
		boundaries,
		plan,
		immutableRecord({ ...input, operation: fieldResolved }),
		immutableArray(['resolveInput']),
		'before',
	)
}

const validateInput = async <const TOperation extends DatabaseOperationAst>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<void> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)

	if (order.family === 'delete' || order.family === 'find') {
		return
	}

	const schema = requireOperationSchema(input.operation)
	const issues = []

	for (const fieldInput of collectOperationFieldInputs(
		input.operation,
		'children-first',
	)) {
		const fieldPlan = plan.getField(schema, fieldInput.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		const handlers = collectNestedHandlers(
			fieldPlan.contributions,
			'before',
			'validate',
			order.family,
		)
		const fieldIssues = await runHookValidations(handlers, (handler) =>
			invokeErasedHook(
				handler,
				immutableRecord({
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

	const schemaHandlers = collectNestedHandlers(
		schemaPlan.contributions,
		'before',
		'validate',
		order.family,
	)
	issues.push(
		...(await runHookValidations(schemaHandlers, (handler) =>
			invokeErasedHook(handler, createSchemaOperationInput(input.operation)),
		)),
	)

	boundaries.throwHookValidationIssues(issues)
}

/** Executes one erased effect while preserving both sync and async handlers. */
const invokeErasedEffect = async (
	handler: ErasedHookHandler,
	input: unknown,
): Promise<void> => {
	await invokeErasedHook(handler, input)
}

const runMutationFieldEffects = async (
	plan: NativeHookContributionPlan,
	operation: DatabaseMutationOperationAst,
	values: ReturnType<typeof collectMutationBeforeFieldValues>,
	phases: readonly FieldHookPhase[],
	direction: 'after' | 'before',
): Promise<void> => {
	const schema = requireOperationSchema(operation)
	const family = getNativeHookPhaseOrder(operation.kind).family

	for (const value of values) {
		const fieldPlan = plan.getField(schema, value.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		for (const phase of phases) {
			const handlers = collectNestedHandlers(
				fieldPlan.contributions,
				direction,
				phase,
				family,
			)

			await runHookEffects(handlers, (handler) =>
				invokeErasedEffect(
					handler,
					immutableRecord({
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
	operation: TOperation,
	outcome: DatabaseOperationOutcome<TOperation>,
): Promise<void> => {
	const schema = requireOperationSchema(operation)
	const family = getNativeHookPhaseOrder(operation.kind).family

	for (const change of collectMutationFieldChanges(operation, outcome)) {
		const fieldPlan = plan.getField(schema, change.fieldPath)

		if (fieldPlan === undefined) {
			continue
		}

		const handlers = collectNestedHandlers(
			fieldPlan.contributions,
			'after',
			'onChange',
			family,
		)

		await runHookEffects(handlers, (handler) =>
			invokeErasedEffect(
				handler,
				immutableRecord({
					change: change.change,
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
	input: RuntimeResultStageInput<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	const schemaPlan = plan.getSchema(requireOperationSchema(input.operation))

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const order = getNativeHookPhaseOrder(input.operation.kind)
	let result = boundaries.snapshotResultReplacement(
		input.operation,
		input.result,
	)

	for (const phase of order.schemaAfter) {
		const handlers = collectNestedHandlers(
			schemaPlan.contributions,
			'after',
			phase,
			order.family,
		)

		result = await runHookTransformChain(
			handlers,
			result,
			async (handler, current) => {
				const replacement = await invokeErasedHook(
					handler,
					createSchemaResultInput(input.operation, current),
				)

				return replacement === undefined
					? undefined
					: boundaries.snapshotResultReplacement(input.operation, replacement)
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

	return immutableRecord({
		fieldAfter: async (input) => {
			const outcome = boundaries.snapshotMutationOutcome(
				input.operation,
				input.outcome,
			)
			const order = getNativeHookPhaseOrder(input.operation.kind)

			await runMutationFieldEffects(
				plan,
				input.operation,
				collectMutationAfterFieldValues(input.operation, outcome),
				order.fieldAfter,
				'after',
			)
			await runChangeEffects(plan, input.operation, outcome)

			return outcome
		},
		fieldBefore: async (input) => {
			const order = getNativeHookPhaseOrder(input.operation.kind)

			await runMutationFieldEffects(
				plan,
				input.operation,
				collectMutationBeforeFieldValues(input.operation, input.target),
				order.fieldBefore,
				'before',
			)
		},
		resolveInput: (input) => resolveInput(boundaries, plan, input),
		revalidate: (input) =>
			boundaries.snapshotOperationReplacement(input.operation, input.operation),
		schemaAfter: (input) => runSchemaResultPhases(boundaries, plan, input),
		schemaBefore: (input) => {
			const order = getNativeHookPhaseOrder(input.operation.kind)

			return runSchemaTransformPhases(
				boundaries,
				plan,
				input,
				order.schemaBefore,
				'before',
			)
		},
		validate: (input) => validateInput(boundaries, plan, input),
	})
}

import { immutableArray, immutableRecord } from '@ultimabase/shared'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type { HookContext } from '../../schema/hooks/hook-context.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { PluginDefinition } from '../../foundation.js'
import { FrameworkApplication } from '../../foundation.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'
import type {
	RuntimeNativeHookStages,
	RuntimeNativeResultStageInput,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
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
import { transformOperationFieldInputs } from './field-inputs.js'
import {
	collectMutationAfterItems,
	collectMutationBeforeItems,
	type RuntimeMutationItemPair,
} from './materializations.js'
import { getNativeHookPhaseOrder } from './phase-order.js'
import { runHookEffects, runHookTransformChain } from './composition.js'
import { createTransactionHookLifecycle } from './transaction-dispatcher.js'
import {
	createFieldHookTarget,
	createSchemaHookTarget,
} from './execution-descriptor.js'
import {
	getApplicationHookExecutionRuntime,
	type HookExecutionRuntime,
} from './execution-runtime.js'

const createSchemaResultInput = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	context: HookContext,
	items: readonly RuntimeMutationItemPair[] | undefined,
): Readonly<{
	readonly context: HookContext
	readonly kind: TOperation['kind']
	readonly operation: TOperation
	readonly result: RuntimeOperationResult<TOperation>
}> => {
	const base = { context, kind: operation.kind, operation, result } as const

	if (items === undefined) return immutableRecord(base)

	switch (operation.kind) {
		case 'create-one':
		case 'delete-one':
		case 'update-one':
		case 'upsert-one': {
			const pair = items[0]

			if (pair === undefined) {
				throw new TypeError(
					'Singular mutation after-hooks require one materialized item pair',
				)
			}

			return immutableRecord({ ...base, ...pair })
		}
		case 'create-many':
		case 'delete-many':
		case 'update-many':
		case 'upsert-many':
			return immutableRecord({ ...base, items })
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return immutableRecord(base)
	}
}

const createSchemaPreparedInput = (
	operation: DatabaseMutationOperationAst,
	context: HookContext,
	target: RuntimePreparedMutationStageInput<DatabaseMutationOperationAst>['target'],
): unknown => {
	const base = createSchemaOperationHookInput(operation, context)
	const items = collectMutationBeforeItems(operation, target)

	switch (operation.kind) {
		case 'create-one':
		case 'delete-one':
		case 'update-one': {
			const pair = items[0]

			if (pair === undefined) {
				throw new TypeError(
					'Singular mutation before-hooks require one materialized item pair',
				)
			}

			return immutableRecord({ ...base, ...pair })
		}
		case 'create-many':
			return immutableRecord({ ...base, items })
		case 'delete-many':
		case 'update-many':
		case 'upsert-many':
		case 'upsert-one':
			return base
	}
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
			input.operation.kind,
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

/** Runs mutation before-hooks after Runtime has prepared any reliable preimage. */
const runSchemaPreparedPhases = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<TOperation>,
): Promise<TOperation> => {
	if (
		(input.operation.kind === 'update-one' ||
			input.operation.kind === 'delete-one') &&
		input.target === null
	) {
		return input.operation
	}

	const schemaPlan = plan.getSchema(
		requireDeclaredOperationSchema(input.operation),
	)

	if (schemaPlan === undefined) {
		throw new TypeError('Native hook plan does not own the operation schema')
	}

	const order = getNativeHookPhaseOrder(input.operation.kind)
	for (const phase of order.schemaBefore) {
		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'before',
			phase,
			input.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			order.family,
		)

		await runHookEffects(handlers, (handler) =>
			invokeErasedHook<undefined>(runtime, handler, input.context, (context) =>
				createSchemaPreparedInput(input.operation, context, input.target),
			),
		)
	}

	return input.operation
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
	const result = boundaries.snapshotResultReplacement(
		input.operation,
		input.result,
		input.selectedFieldsOverride,
	)

	if (order.family === 'read') {
		return result
	}

	if (input.outcome === undefined) {
		throw new TypeError(
			'Schema mutation after-hooks require private materializations',
		)
	}

	const items = collectMutationAfterItems(input.outcome)

	if (
		(input.operation.kind === 'update-one' ||
			input.operation.kind === 'delete-one') &&
		items.length === 0
	) {
		// A nullable where-based mutation has no item lifecycle when it matched no row.
		return result
	}

	for (const phase of order.schemaAfter) {
		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			phase,
			input.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			order.family,
		)

		await runHookEffects(handlers, (handler) =>
			invokeErasedHook<undefined>(runtime, handler, input.context, (context) =>
				createSchemaResultInput(input.operation, result, context, items),
			),
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
		mutationOutcome: (input) =>
			boundaries.snapshotMutationOutcome(input.operation, input.outcome),
		resolveInput: (input) => resolveInput(boundaries, plan, runtime, input),
		// Output representation belongs to field definitions and transports, not hooks.
		resolveOutput: ({ result }) => result,
		revalidate: (input) =>
			boundaries.snapshotOperationReplacement(input.operation, input.operation),
		schemaAfter: (input) =>
			runSchemaResultPhases(boundaries, plan, runtime, input),
		schemaPrepared: (input) => runSchemaPreparedPhases(plan, runtime, input),
		// Schema read hooks and schema validation are intentionally not public phases.
		schemaBefore: ({ operation }) => operation,
		validate: () => undefined,
	})
}

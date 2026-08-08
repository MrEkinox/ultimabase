import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type { HookContext } from '../../schema/hooks/hook-context.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from '../../schema/schema/model.js'
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
import { getMutationHookKind, getNativeHookPhaseOrder } from './phase-order.js'
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
	item: RuntimeMutationItemPair,
	materializedOriginalItem: object | null,
): Readonly<{
	readonly context: HookContext
	readonly kind: ReturnType<typeof getMutationHookKind>
	readonly operation: TOperation
	readonly result: RuntimeOperationResult<TOperation>
}> => {
	return immutableRecord({
		context,
		...item,
		originalItem: materializedOriginalItem,
		kind: getMutationHookKind(operation.kind),
		operation,
		result,
	})
}

const createSchemaPreparedInput = (
	operation: DatabaseMutationOperationAst,
	context: HookContext,
	item: RuntimeMutationItemPair,
	preparedCreateItem?: object,
	materializedOriginalItem?: object | null,
): unknown => {
	if (operation.kind === 'create-one') {
		if (preparedCreateItem === undefined) {
			throw new TypeError('Prepared create hook requires one draft instance')
		}

		return immutableRecord({
			context,
			item: preparedCreateItem,
			kind: 'create' as const,
		})
	}

	const base = createSchemaOperationHookInput(
		operation,
		context,
		getMutationHookKind(operation.kind),
	)

	if (materializedOriginalItem === undefined) {
		throw new TypeError(
			'Prepared mutation hook requires one materialized original item',
		)
	}

	return immutableRecord({
		...base,
		...item,
		originalItem: materializedOriginalItem,
	})
}

/** Materializes one stable visible preimage without leaking adapter state. */
const materializeSchemaResolveOriginalItem = (
	operation: DatabaseMutationOperationAst,
	schema: SchemaDefinition,
	target: RuntimePreparedMutationStageInput<DatabaseMutationOperationAst>['target'],
): object | null => {
	if (
		operation.kind === 'create-many' ||
		operation.kind === 'update-many' ||
		operation.kind === 'upsert-many'
	) {
		throw new TypeError(
			'Schema resolveInput requires itemized mutation operations',
		)
	}

	if (operation.kind === 'delete-one' || operation.kind === 'delete-many') {
		throw new TypeError('Delete operations do not resolve mutation input')
	}

	if (operation.kind === 'create-one') return null

	if (operation.kind === 'update-one' && !isPlainRecord(target)) {
		throw new TypeError('Update resolveInput requires one prepared target')
	}

	if (
		operation.kind === 'upsert-one' &&
		target !== null &&
		!isPlainRecord(target)
	) {
		throw new TypeError(
			'Upsert resolveInput requires a prepared target snapshot',
		)
	}

	if (target === null) return null

	if (!isPlainRecord(target)) {
		throw new TypeError('Schema resolveInput requires a prepared target')
	}

	return materializeSchemaModel(schema, target)
}

/** Exposes one stable materialized preimage to schema input resolution. */
const createSchemaResolveInput = (
	operation: DatabaseMutationOperationAst,
	context: HookContext,
	originalItem: object | null,
): unknown => {
	return immutableRecord({
		...createSchemaOperationHookInput(
			operation,
			context,
			getMutationHookKind(operation.kind),
		),
		originalItem,
	})
}

/** Materializes a persisted hook preimage while preserving a missing create value. */
const materializeSchemaOriginalItem = (
	schema: SchemaDefinition,
	originalItem: RuntimeMutationItemPair['originalItem'],
): object | null =>
	originalItem === null ? null : materializeSchemaModel(schema, originalItem)

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

	if (
		operation.kind === 'create-many' ||
		operation.kind === 'update-many' ||
		operation.kind === 'upsert-many'
	) {
		// Public collection commands are itemized before native hooks reach Runtime.
		return operation
	}

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
					kind: getMutationHookKind(operation.kind),
					mode: fieldInput.mode,
					value,
				}),
			),
		)
	})
}

const runSchemaTransformPhases = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<TOperation>,
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
	const originalItem = materializeSchemaResolveOriginalItem(
		input.operation,
		schemaPlan.schema,
		input.target,
	)
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
					(context) => createSchemaResolveInput(current, context, originalItem),
				)

				return replacement === undefined
					? undefined
					: boundaries.snapshotPreparedOperationReplacement(
							current,
							replacement,
						)
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
): Promise<void> => {
	if (
		input.operation.kind === 'create-many' ||
		input.operation.kind === 'update-many' ||
		input.operation.kind === 'upsert-many' ||
		input.operation.kind === 'delete-many'
	) {
		return
	}

	if (
		(input.operation.kind === 'update-one' ||
			input.operation.kind === 'delete-one') &&
		input.target === null
	) {
		return
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
		if (handlers.length === 0) continue

		const items = collectMutationBeforeItems(
			input.operation,
			input.target,
			input.targets,
		)

		for (const item of items) {
			const preparedCreateItem =
				input.operation.kind === 'create-one' && isPlainRecord(item.item)
					? materializePreparedSchemaDraft(schemaPlan.schema, item.item)
					: undefined
			const materializedOriginalItem = materializeSchemaOriginalItem(
				schemaPlan.schema,
				item.originalItem,
			)

			await runHookEffects(handlers, (handler) =>
				invokeErasedHook<undefined>(
					runtime,
					handler,
					input.context,
					(context) =>
						createSchemaPreparedInput(
							input.operation,
							context,
							item,
							preparedCreateItem,
							materializedOriginalItem,
						),
				),
			)
		}
	}

}

const resolveInput = async <const TOperation extends DatabaseOperationAst>(
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	const order = getNativeHookPhaseOrder(input.operation.kind)

	if (order.family === 'delete' || order.family === 'read') {
		return input.operation
	}

	const fieldResolved = await resolveFieldInputs(plan, runtime, input)

	return fieldResolved
}

/** Runs schema input resolution only after Access has hidden and locked the target. */
const resolveSchemaInput = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	boundaries: RuntimeHookBoundaries,
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<TOperation>,
): Promise<TOperation> => {
	if (
		input.operation.kind === 'delete-one' ||
		input.operation.kind === 'delete-many'
	) {
		return input.operation
	}

	if (input.operation.kind === 'update-one' && input.target === null) {
		return input.operation
	}

	return runSchemaTransformPhases(
		boundaries,
		plan,
		runtime,
		input,
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

	if (
		order.family === 'read' ||
		input.operation.kind === 'create-many' ||
		input.operation.kind === 'update-many' ||
		input.operation.kind === 'upsert-many' ||
		input.operation.kind === 'delete-many'
	) {
		return result
	}

	if (input.outcome === undefined) {
		throw new TypeError(
			'Schema mutation after-hooks require private materializations',
		)
	}

	const items = collectMutationAfterItems(input.outcome)

	for (const phase of order.schemaAfter) {
		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			phase,
			input.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			order.family,
		)

		for (const item of items) {
			const materializedOriginalItem = materializeSchemaOriginalItem(
				schemaPlan.schema,
				item.originalItem,
			)

			await runHookEffects(handlers, (handler) =>
				invokeErasedHook<undefined>(
					runtime,
					handler,
					input.context,
					(context) =>
						createSchemaResultInput(
							input.operation,
							result,
							context,
							item,
							materializedOriginalItem,
						),
				),
			)
		}
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
		// Public collection commands are itemized before native hook dispatch.
		requiresPreparedMutationItems: () => false,
		resolveInput: (input) => resolveInput(plan, runtime, input),
		// Output representation belongs to field definitions and transports, not hooks.
		resolveOutput: ({ result }) => result,
		revalidate: (input) =>
			boundaries.snapshotOperationReplacement(input.operation, input.operation),
		schemaAfter: (input) =>
			runSchemaResultPhases(boundaries, plan, runtime, input),
		schemaPrepared: (input) => runSchemaPreparedPhases(plan, runtime, input),
		schemaResolveInput: (input) =>
			resolveSchemaInput(boundaries, plan, runtime, input),
	})
}

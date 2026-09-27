import { isPlainRecord } from '@ultimabase/shared'
import type {
	DatabaseLogicalRecord,
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	RuntimeBehaviorBoundaries,
	RuntimeMaterializedResultStageInput,
	RuntimePreparedMutationStageInput,
} from '@ultimabase/core'

import { runHookEffects, runHookTransformChain } from './composition.js'
import type { HookContributionPlan } from './contribution-plan.js'
import {
	collectNestedHookHandlers,
	invokeErasedHook,
	requireDeclaredOperationSchema,
} from './contribution-execution.js'
import { createSchemaHookTarget } from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import {
	createSchemaAfterInput,
	createSchemaPreparedInput,
	createSchemaResolveInput,
	materializePreparedCreateItem,
	materializeSchemaItem,
	materializeSchemaOriginalItem,
	materializeSchemaResolveOriginalItem,
} from './input-resolution.js'
import {
	collectMutationAfterItems,
	collectMutationBeforeItems,
} from './materializations.js'
import { getNativeHookPhaseOrder } from './phase-order.js'

/** Resolves schema input through the sole transform phase, in before order. */
export const runSchemaResolveInput = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	boundaries: RuntimeBehaviorBoundaries,
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<
		TOperation,
		DatabaseMutationLogicalRecord<TOperation>
	>,
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
	const handlers = collectNestedHookHandlers(
		schemaPlan.contributions,
		'before',
		'resolveInput',
		input.operation.kind,
		createSchemaHookTarget(schemaPlan.schema.className),
		family,
	)

	return runHookTransformChain(
		handlers,
		input.operation,
		async (handler, current) => {
			const replacement = await invokeErasedHook<unknown>(
				runtime,
				handler,
				input.context,
				(context) =>
					createSchemaResolveInput(
						current,
						context,
						originalItem,
						input.nestedWrite?.graph,
					),
			)

			return replacement === undefined
				? undefined
				: boundaries.snapshotPreparedOperationReplacement(current, replacement)
		},
	)
}

/** Runs mutation before-hooks after Runtime has prepared any reliable preimage. */
export const runSchemaPreparedPhases = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimePreparedMutationStageInput<TOperation, DatabaseLogicalRecord>,
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
					? materializePreparedCreateItem(schemaPlan.schema, item.item)
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
							input.nestedWrite?.graph,
						),
				),
			)
		}
	}
}

export const runSchemaResultPhases = async <
	const TOperation extends DatabaseOperationAst,
	const TResult,
>(
	boundaries: RuntimeBehaviorBoundaries,
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
	input: RuntimeMaterializedResultStageInput<TOperation, TResult>,
): Promise<TResult> => {
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
		// The boundary preserves the exact generic result while restoring metadata.
		return result as TResult
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
			const materializedItem = materializeSchemaItem(
				schemaPlan.schema,
				item.item,
			)

			await runHookEffects(handlers, (handler) =>
				invokeErasedHook<undefined>(
					runtime,
					handler,
					input.context,
					(context) =>
						createSchemaAfterInput(
							input.operation,
							context,
							materializedOriginalItem,
							materializedItem,
							input.nestedWrite?.graph,
						),
				),
			)
		}
	}

	// The boundary preserves the exact generic result while restoring metadata.
	return result as TResult
}

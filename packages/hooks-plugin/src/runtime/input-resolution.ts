import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import {
	materializePreparedSchemaDraft,
	materializeSchemaModel,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type RuntimeOperationStageInput,
	type RuntimePreparedMutationStageInput,
	type SchemaDefinition,
} from '@ultimabase/core'

import type { HookContext } from '../context/hook-context.js'
import type { HookContributionPlan } from './contribution-plan.js'
import {
	collectNestedHookHandlers,
	createSchemaOperationHookInput,
	invokeErasedHook,
	requireDeclaredOperationSchema,
} from './contribution-execution.js'
import { runHookTransformChain } from './composition.js'
import { createFieldHookTarget } from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import { transformOperationFieldInputs } from './field-inputs.js'
import type { RuntimeMutationItemPair } from './materializations.js'
import { getMutationHookKind, getNativeHookPhaseOrder } from './phase-order.js'

export const createSchemaAfterInput = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	context: HookContext,
	materializedOriginalItem: object | null,
	materializedItem: object | null,
): Readonly<{
	readonly context: HookContext
	readonly item: object | null
	readonly kind: ReturnType<typeof getMutationHookKind>
	readonly operation: TOperation
	readonly originalItem: object | null
}> =>
	immutableRecord({
		context,
		item: materializedItem,
		originalItem: materializedOriginalItem,
		kind: getMutationHookKind(operation.kind),
		operation,
	})

export const createSchemaPreparedInput = (
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
export const materializeSchemaResolveOriginalItem = (
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

export const createSchemaResolveInput = (
	operation: DatabaseMutationOperationAst,
	context: HookContext,
	originalItem: object | null,
): unknown =>
	immutableRecord({
		...createSchemaOperationHookInput(
			operation,
			context,
			getMutationHookKind(operation.kind),
		),
		originalItem,
	})

export const materializeSchemaOriginalItem = (
	schema: SchemaDefinition,
	originalItem: RuntimeMutationItemPair['originalItem'],
): object | null =>
	originalItem === null ? null : materializeSchemaModel(schema, originalItem)

export const materializeSchemaItem = (
	schema: SchemaDefinition,
	item: RuntimeMutationItemPair['item'],
): object | null =>
	item === null ? null : materializeSchemaModel(schema, item)

export const materializePreparedCreateItem = (
	schema: SchemaDefinition,
	item: RuntimeMutationItemPair['item'],
): object | undefined =>
	isPlainRecord(item) ? materializePreparedSchemaDraft(schema, item) : undefined

export const resolveFieldInputs = async <
	const TOperation extends DatabaseOperationAst,
>(
	plan: HookContributionPlan,
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
		return operation
	}

	return transformOperationFieldInputs(operation, async (fieldInput) => {
		const fieldPlan = plan.getField(schema, fieldInput.fieldPath)
		if (fieldPlan === undefined) return undefined

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

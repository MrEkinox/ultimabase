import {
	applyUpdateExpressionToRecord,
	getOperationSchema,
	isRelationUpdateExpression,
	Schema,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterializationSource,
	type DatabaseMutationOperationAst,
	type DatabaseMutationOperationKind,
	type ExecutableOperationAst,
	type OperationKind,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { SchemaMutationKind } from '../authoring/contracts.js'
import type {
	HookOperationFamily,
	SchemaHookPhase,
} from '../authoring/declarations.js'

/** Captures the deterministic business phase nesting for one terminal operation. */
export interface NativeHookPhaseOrder {
	readonly family: HookOperationFamily
	readonly schemaAfter: readonly SchemaHookPhase[]
	readonly schemaBefore: readonly SchemaHookPhase[]
}

const phaseOrder = (
	family: HookOperationFamily,
	schemaBefore: readonly SchemaHookPhase[],
	schemaAfter: readonly SchemaHookPhase[],
): NativeHookPhaseOrder =>
	immutableRecord({
		family,
		schemaAfter: immutableArray(schemaAfter),
		schemaBefore: immutableArray(schemaBefore),
	})

const createOrder = phaseOrder('create', ['beforeCreate'], ['afterCreate'])
const updateOrder = phaseOrder('update', ['beforeUpdate'], ['afterUpdate'])
// Atomic upserts expose their resolved create/update branch only after persistence.
const upsertOrder = phaseOrder('upsert', [], ['afterUpsert'])
const deleteOrder = phaseOrder('delete', ['beforeDelete'], ['afterDelete'])
const readOrder = phaseOrder('read', [], [])

// The exhaustive record makes new operation terminals fail type checking until ordered.
const nativeHookPhaseOrders = immutableRecord({
	count: readOrder,
	'create-many': createOrder,
	'create-one': createOrder,
	'delete-many': deleteOrder,
	'delete-one': deleteOrder,
	exists: readOrder,
	'find-many': readOrder,
	'find-one': readOrder,
	get: readOrder,
	'update-many': updateOrder,
	'update-one': updateOrder,
	'upsert-many': upsertOrder,
	'upsert-one': upsertOrder,
} satisfies Readonly<Record<OperationKind, NativeHookPhaseOrder>>)

/** Returns a stable frozen phase plan without rebuilding arrays per operation. */
export const getNativeHookPhaseOrder = (
	kind: OperationKind,
): NativeHookPhaseOrder => nativeHookPhaseOrders[kind]

/** Resolves the public item lifecycle name while rejecting read terminals. */
export const getMutationHookKind = (
	kind: OperationKind,
): SchemaMutationKind => {
	const { family } = nativeHookPhaseOrders[kind]
	if (family === 'read') {
		throw new TypeError('Read terminals do not have a mutation hook kind')
	}
	return family
}

/** Correlates the complete logical value before and after one materialized item. */
export interface RuntimeMutationItemPair {
	readonly originalItem: DatabaseLogicalRecord | null
	readonly item: DatabaseLogicalRecord | null
}

const emptyMutationItems: readonly RuntimeMutationItemPair[] = immutableArray(
	[],
)

const itemPair = (
	originalItem: DatabaseLogicalRecord | null,
	item: DatabaseLogicalRecord | null,
): RuntimeMutationItemPair => immutableRecord({ originalItem, item })

const requireBoundary = <TValue>(
	value: TValue | undefined,
	message: string,
): TValue => {
	if (value === undefined) throw new TypeError(message)
	return value
}

/**
 * Builds the candidate snapshots available before persistence.
 *
 * Atomic upserts deliberately remain empty because their create/update branch
 * is not known until the database statement executes. Set-based targets exist
 * only when Runtime requested them for declared item hooks.
 */
export const collectMutationBeforeItems = (
	mutation: DatabaseMutationOperationAst,
	target: DatabaseLogicalRecord | null | undefined,
	targets?: readonly DatabaseLogicalRecord[],
): readonly RuntimeMutationItemPair[] => {
	// Core normalizes every mutation AST to its executable runtime counterpart.
	const operation = mutation as unknown as Extract<
		ExecutableOperationAst,
		{ readonly kind: DatabaseMutationOperationKind }
	>
	const updatePair = (
		originalItem: DatabaseLogicalRecord,
	): RuntimeMutationItemPair => {
		const update: unknown =
			operation.kind === 'update-one' || operation.kind === 'update-many'
				? operation.update
				: undefined
		const schema = getOperationSchema(operation)
		if (!Schema.is(schema)) {
			throw new TypeError('Prepared update hooks require a declared schema')
		}
		// Relation-only updates leave the scalar preimage unchanged.
		const applies =
			isPlainRecord(update) &&
			update.kind === 'update-expression' &&
			!isRelationUpdateExpression(update)
		return itemPair(
			originalItem,
			applies
				? applyUpdateExpressionToRecord(
						schema,
						originalItem,
						update as unknown as UpdateExpressionNode,
					)
				: originalItem,
		)
	}
	const single = (
		message: string,
		pair: (current: DatabaseLogicalRecord) => RuntimeMutationItemPair,
	): readonly RuntimeMutationItemPair[] => {
		const current = requireBoundary(target, message)
		return current === null
			? emptyMutationItems
			: immutableArray([pair(current)])
	}

	switch (operation.kind) {
		case 'create-one':
			return immutableArray([itemPair(null, operation.input)])
		case 'create-many':
			return immutableArray(
				operation.inputs.map((input) => itemPair(null, input)),
			)
		case 'update-one':
			return single(
				'Prepared update hooks require a target boundary',
				updatePair,
			)
		case 'update-many':
			return immutableArray(
				requireBoundary(
					targets,
					'Prepared set-based update hooks require a targets boundary',
				).map(updatePair),
			)
		case 'delete-one':
			return single(
				'Prepared delete hooks require a target boundary',
				(current) => itemPair(current, null),
			)
		case 'delete-many':
			return immutableArray(
				requireBoundary(
					targets,
					'Prepared set-based delete hooks require a targets boundary',
				).map((current) => itemPair(current, null)),
			)
		case 'upsert-many':
		case 'upsert-one':
			return emptyMutationItems
	}
}

/** Builds exact persisted item pairs independently from the public selection. */
export const collectMutationAfterItems = (
	outcome: DatabaseMutationMaterializationSource,
): readonly RuntimeMutationItemPair[] =>
	immutableArray(
		outcome.materializations.map((materialization) =>
			materialization.kind === 'create'
				? itemPair(null, materialization.current)
				: materialization.kind === 'update'
					? itemPair(materialization.previous, materialization.current)
					: itemPair(materialization.previous, null),
		),
	)

import {
	applyUpdateExpressionToRecord,
	isRelationUpdateExpression,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterializationSource,
	type OperationKind,
	type SchemaDefinition,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { SchemaMutationKind } from '../authoring/contracts.js'
import type { HookOperationFamily } from '../authoring/declarations.js'

// The exhaustive record makes new operation terminals fail type checking until mapped.
const operationFamilies = immutableRecord({
	count: 'read',
	'create-many': 'create',
	'create-one': 'create',
	'delete-many': 'delete',
	'delete-one': 'delete',
	exists: 'read',
	'find-many': 'read',
	'find-one': 'read',
	get: 'read',
	'update-many': 'update',
	'update-one': 'update',
	'upsert-many': 'upsert',
	'upsert-one': 'upsert',
} satisfies Readonly<Record<OperationKind, HookOperationFamily>>)

/** Names the operation family (`create`, `update`, …, or `read`) of one terminal. */
export const getHookOperationFamily = (
	kind: OperationKind,
): HookOperationFamily => operationFamilies[kind]

/** Resolves the public item lifecycle name while rejecting read terminals. */
export const getMutationHookKind = (
	kind: OperationKind,
): SchemaMutationKind => {
	const family = operationFamilies[kind]
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

const itemPair = (
	originalItem: DatabaseLogicalRecord | null,
	item: DatabaseLogicalRecord | null,
): RuntimeMutationItemPair => immutableRecord({ originalItem, item })

/**
 * Applies the scalar part of one update to its locked target: the complete
 * object the update will store. Relation link changes leave it unchanged.
 */
export const applyUpdateToTarget = (
	schema: SchemaDefinition,
	target: DatabaseLogicalRecord,
	update: unknown,
): DatabaseLogicalRecord => {
	const applies =
		isPlainRecord(update) &&
		update.kind === 'update-expression' &&
		!isRelationUpdateExpression(update)
	return applies
		? applyUpdateExpressionToRecord(
				schema,
				target,
				update as unknown as UpdateExpressionNode,
			)
		: target
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

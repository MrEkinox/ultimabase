import {
	isRelationUpdateExpression,
	Pointer,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { and, eq, inArray, notInArray } from 'drizzle-orm'

import { required } from '../required.js'
import {
	resolveCompiledPostgresField,
	type CompiledPostgresRelation,
} from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'

type PostgresRelationAction = 'clear' | 'connect' | 'disconnect' | 'set'

const relationActions: ReadonlySet<unknown> = new Set<PostgresRelationAction>([
	'clear',
	'connect',
	'disconnect',
	'set',
])

const isPostgresRelationAction = (
	value: unknown,
): value is PostgresRelationAction => relationActions.has(value)

/** Revalidates the portable relation delta at the concrete adapter boundary. */
const readPostgresRelationDelta = (
	relation: CompiledPostgresRelation,
	update: unknown,
): Readonly<{ action: PostgresRelationAction; targetIds: string[] }> => {
	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations)
	) {
		throw new TypeError('PostgreSQL relation update expression is invalid')
	}

	const candidates = update.operations.filter(
		(operation) => isPlainRecord(operation) && operation.kind === 'relation',
	)
	const candidate: unknown = candidates[0]

	if (candidates.length !== 1) {
		throw new TypeError('PostgreSQL relation update requires one delta')
	}

	if (
		!isPlainRecord(candidate) ||
		candidate.field !== relation.relation.fieldPath[0] ||
		!isPlainRecord(candidate.value) ||
		!isPostgresRelationAction(candidate.value.action) ||
		!isUnknownArray(candidate.value.targets)
	) {
		throw new TypeError('PostgreSQL relation delta is invalid')
	}

	const action = candidate.value.action
	const targetIds = new Set<string>()

	for (const target of candidate.value.targets) {
		if (!Pointer.is(target) || target.schema !== relation.relation.target) {
			throw new TypeError('PostgreSQL relation target is invalid')
		}
		if (targetIds.has(target.id)) {
			throw new TypeError('PostgreSQL relation targets must be unique')
		}

		targetIds.add(target.id)
	}

	if (
		(action === 'clear' && targetIds.size !== 0) ||
		((action === 'connect' || action === 'disconnect') && targetIds.size === 0)
	) {
		throw new TypeError('PostgreSQL relation target cardinality is invalid')
	}

	return { action, targetIds: [...targetIds] }
}

/** Applies one logical edge delta inside the transaction that owns its source update. */
export const executePostgresRelationMutation = async (
	client: PostgresDrizzleClient,
	relation: CompiledPostgresRelation,
	update: unknown,
	sourceObjectId: unknown,
): Promise<void> => {
	const { action, targetIds } = readPostgresRelationDelta(relation, update)
	const storage = relation.storage

	// Core already lowered inverse pointers through the target update lifecycle.
	if (storage.kind === 'pointer') return

	// Both logical identities must belong to registered PostgreSQL id columns.
	resolveCompiledPostgresField(relation.source, 'id')
	if (targetIds.length > 0) resolveCompiledPostgresField(relation.target, 'id')

	const sourcePredicate = eq(storage.sourceColumn, sourceObjectId)

	if (action === 'clear' || action === 'set') {
		const stalePredicate =
			action === 'set' && targetIds.length > 0
				? and(sourcePredicate, notInArray(storage.targetColumn, targetIds))
				: sourcePredicate

		await client
			.delete(storage.relation.table)
			.where(
				required(
					stalePredicate,
					'PostgreSQL relation set predicate is unavailable',
				),
			)
	}

	if (action === 'disconnect') {
		await client
			.delete(storage.relation.table)
			.where(
				required(
					and(sourcePredicate, inArray(storage.targetColumn, targetIds)),
					'PostgreSQL relation disconnect predicate is unavailable',
				),
			)
		return
	}

	if (action === 'clear' || targetIds.length === 0) return

	// Logical orientation maps back to the owning join columns.
	const owning = storage.sourceColumn === storage.relation.sourceColumn

	await client
		.insert(storage.relation.table)
		.values(
			targetIds.map((targetId) =>
				owning
					? { sourceId: sourceObjectId, targetId }
					: { sourceId: targetId, targetId: sourceObjectId },
			),
		)
		.onConflictDoNothing()
}

/** Applies an edge delta and avoids a redundant source update when no scalar changed. */
export const executePostgresScopedRelationMutation = async (
	client: PostgresDrizzleClient,
	relation: CompiledPostgresRelation,
	update: UpdateExpressionNode,
	previous: DatabaseLogicalRecord,
): Promise<
	| Readonly<{
			materialization: DatabaseMutationMaterialization
			record: DatabaseLogicalRecord
	  }>
	| undefined
> => {
	if (!isRelationUpdateExpression(update)) return undefined

	await executePostgresRelationMutation(client, relation, update, previous.id)

	if (update.operations.some((operation) => operation.kind !== 'relation')) {
		return undefined
	}

	return immutableRecord({
		materialization: immutableRecord({
			current: previous,
			kind: 'update' as const,
			previous,
		}),
		record: previous,
	})
}

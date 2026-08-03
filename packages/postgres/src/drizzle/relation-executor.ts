import { Pointer } from '@ultimabase/core'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import { and, eq, inArray, notInArray } from 'drizzle-orm'

import type { CompiledPostgresRelation } from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'
import type { PostgresDrizzleClient } from './client.js'

type PostgresRelationAction = 'clear' | 'connect' | 'disconnect' | 'set'

interface PostgresRelationDelta {
	readonly action: PostgresRelationAction
	readonly targets: readonly Pointer[]
}

const isPostgresRelationAction = (
	value: unknown,
): value is PostgresRelationAction =>
	value === 'clear' ||
	value === 'connect' ||
	value === 'disconnect' ||
	value === 'set'

/** Revalidates the portable relation delta at the concrete adapter boundary. */
const readPostgresRelationDelta = (
	relation: CompiledPostgresRelation,
	update: unknown,
): PostgresRelationDelta => {
	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations)
	) {
		throw new TypeError('PostgreSQL relation update expression is invalid')
	}

	const candidates: Readonly<Record<string, unknown>>[] = []

	for (const operation of update.operations) {
		if (isPlainRecord(operation) && operation.kind === 'relation') {
			candidates.push(operation)
		}
	}

	if (candidates.length !== 1) {
		throw new TypeError('PostgreSQL relation update requires one delta')
	}

	const candidate = candidates[0]
	const fieldName = relation.relation.fieldPath[0]

	if (
		candidate === undefined ||
		candidate.field !== fieldName ||
		!isPlainRecord(candidate.value) ||
		!isPostgresRelationAction(candidate.value.action) ||
		!isUnknownArray(candidate.value.targets)
	) {
		throw new TypeError('PostgreSQL relation delta is invalid')
	}

	const targets: Pointer[] = []
	const targetIds = new Set<string>()

	for (const target of candidate.value.targets) {
		if (!Pointer.is(target) || target.schema !== relation.relation.target) {
			throw new TypeError('PostgreSQL relation target is invalid')
		}
		if (targetIds.has(target.id)) {
			throw new TypeError('PostgreSQL relation targets must be unique')
		}

		targetIds.add(target.id)
		targets.push(target)
	}

	if (
		(candidate.value.action === 'clear' && targets.length !== 0) ||
		((candidate.value.action === 'connect' ||
			candidate.value.action === 'disconnect') &&
			targets.length === 0)
	) {
		throw new TypeError('PostgreSQL relation target cardinality is invalid')
	}

	return { action: candidate.value.action, targets }
}

/** Encodes one object identity through its registered PostgreSQL UUID boundary. */
const encodeRelationObjectId = (
	relation: CompiledPostgresRelation,
	side: 'source' | 'target',
	id: unknown,
): unknown =>
	resolveCompiledPostgresField(relation[side], 'id').codec.encode(id)

/** Converts logical source/target orientation back to owning join columns. */
const createOwningEdgeValues = (
	relation: CompiledPostgresRelation,
	sourceId: unknown,
	targetId: unknown,
): Readonly<{ readonly sourceId: unknown; readonly targetId: unknown }> => {
	if (relation.storage.kind !== 'join') {
		throw new TypeError('PostgreSQL relation does not use join storage')
	}

	return relation.storage.sourceColumn ===
		relation.storage.relation.sourceColumn
		? { sourceId, targetId }
		: { sourceId: targetId, targetId: sourceId }
}

/** Applies one logical edge delta inside the transaction that owns its source update. */
export const executePostgresRelationMutation = async (
	client: PostgresDrizzleClient,
	relation: CompiledPostgresRelation,
	update: unknown,
	sourceObjectId: unknown,
): Promise<void> => {
	const delta = readPostgresRelationDelta(relation, update)

	// Core already lowered inverse pointers through the target update lifecycle.
	if (relation.storage.kind === 'pointer') return

	const sourceId = encodeRelationObjectId(relation, 'source', sourceObjectId)
	const targetIds = delta.targets.map((target) =>
		encodeRelationObjectId(relation, 'target', target.id),
	)
	const sourcePredicate = eq(relation.storage.sourceColumn, sourceId)

	if (delta.action === 'clear' || delta.action === 'set') {
		const stalePredicate =
			delta.action === 'set' && targetIds.length > 0
				? and(
						sourcePredicate,
						notInArray(relation.storage.targetColumn, targetIds),
					)
				: sourcePredicate

		if (stalePredicate === undefined) {
			throw new TypeError('PostgreSQL relation set predicate is unavailable')
		}

		await client.delete(relation.storage.relation.table).where(stalePredicate)
	}

	if (delta.action === 'disconnect') {
		const predicate = and(
			sourcePredicate,
			inArray(relation.storage.targetColumn, targetIds),
		)

		if (predicate === undefined) {
			throw new TypeError(
				'PostgreSQL relation disconnect predicate is unavailable',
			)
		}

		await client.delete(relation.storage.relation.table).where(predicate)
		return
	}

	if (delta.action === 'clear' || targetIds.length === 0) return

	await client
		.insert(relation.storage.relation.table)
		.values(
			targetIds.map((targetId) =>
				createOwningEdgeValues(relation, sourceId, targetId),
			),
		)
		.onConflictDoNothing()
}

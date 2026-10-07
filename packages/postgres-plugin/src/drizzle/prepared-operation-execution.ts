import {
	FrameworkError,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabasePersistencePlan,
	type ExecutableOperationAst,
	type QueryAst,
	type UniqueUpsertTargetNode,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import type { SQL } from 'drizzle-orm'

import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import type {
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { compilePostgresSelection } from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'
import {
	lockPostgresMutationTarget,
	tryCreatePostgresUpsert,
} from './operation-executor.js'
import {
	createRetainedMutationTarget,
	executeRetainedUpdate,
} from './prepared-persistence.js'
import { readPostgresRecord } from './record.js'
import { executePostgresScopedRelationMutation } from './scoped-relation-mutation.js'

type RuntimeMutationOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: DatabaseMutationOperationAst['kind'] }
>

export type RuntimeLockedOperation = Extract<
	RuntimeMutationOperation,
	{ readonly kind: 'delete-one' | 'update-one' }
>
export interface RuntimeUpsertItem {
	readonly create: Readonly<Record<string, unknown>>
	readonly query: QueryAst
	readonly target: UniqueUpsertTargetNode
	readonly update: UpdateExpressionNode
}
interface PersistedMutationItem {
	readonly materialization: DatabaseMutationMaterialization
	readonly record: DatabaseLogicalRecord
}

export const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	plan: DatabasePersistencePlan,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
	relation: CompiledPostgresRelation | undefined,
): Promise<
	Readonly<{
		materialization: DatabaseMutationMaterialization
		record: DatabaseLogicalRecord
	}>
> => {
	if (operation.kind === 'update-one') {
		if (plan.kind !== 'update-one') {
			throw new TypeError('PostgreSQL update-one requires an update-one plan')
		}

		if (relation !== undefined) {
			const relationResult = await executePostgresScopedRelationMutation(
				client,
				relation,
				operation.update,
				previous,
			)
			if (relationResult !== undefined) return relationResult
		}

		const current = await executeRetainedUpdate(
			client,
			schema,
			operation.update,
			previous,
			constraint,
		)

		return immutableRecord({
			materialization: immutableRecord({
				current,
				kind: 'update' as const,
				previous,
			}),
			record: current,
		})
	}
	if (plan.kind === 'update-one') {
		await executeRetainedUpdate(
			client,
			schema,
			plan.data.update,
			previous,
			constraint,
		)

		// Logical delete observers and results retain the preimage across a physical rewrite.
		return immutableRecord({
			materialization: immutableRecord({
				kind: 'delete' as const,
				previous,
			}),
			record: previous,
		})
	}
	if (plan.kind !== 'delete-one') {
		throw new TypeError('PostgreSQL delete-one received an invalid plan kind')
	}

	const [row] = await client
		.delete(schema.table)
		.where(createRetainedMutationTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	if (row === undefined) {
		throw new TypeError(
			'PostgreSQL prepared delete target disappeared before execution',
		)
	}

	const removed = readPostgresRecord(schema, row)

	return immutableRecord({
		materialization: immutableRecord({
			kind: 'delete' as const,
			previous: removed,
		}),
		record: removed,
	})
}

/** Resolves one upsert branch without guessing from a speculative pre-read. */
export const executeUpsertItem = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	item: RuntimeUpsertItem,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<PersistedMutationItem> => {
	let previous = await lockPostgresMutationTarget(
		client,
		schema,
		item.query,
		constraint,
		relationCompiler,
	)

	if (previous === null) {
		const created = await tryCreatePostgresUpsert(
			client,
			schema,
			item.create,
			item.target,
		)

		if (created !== null) {
			return immutableRecord({
				materialization: immutableRecord({
					current: created,
					kind: 'create' as const,
				}),
				record: created,
			})
		}

		// A concurrent insert may win after the initial absent-target snapshot.
		previous = await lockPostgresMutationTarget(
			client,
			schema,
			item.query,
			constraint,
			relationCompiler,
		)
	}

	if (previous === null) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'PostgreSQL upsert conflict is outside the permitted target.',
			{
				publicMessage: 'The operation violates a data constraint.',
				internalDetails: { kind: 'postgres-upsert-target-inaccessible' },
			},
		)
	}

	const current = await executeRetainedUpdate(
		client,
		schema,
		item.update,
		previous,
		constraint,
	)

	return immutableRecord({
		materialization: immutableRecord({
			current,
			kind: 'update' as const,
			previous,
		}),
		record: current,
	})
}

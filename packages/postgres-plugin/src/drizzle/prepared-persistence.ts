import type {
	DatabaseLogicalRecord,
	DatabaseMutationMaterialization,
	DatabaseMutationOperationAst,
	DatabaseOperationOutcome,
	DatabasePersistencePlan,
	ExecutableOperationAst,
	UpdateExpressionNode,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { and, eq, inArray, type SQL } from 'drizzle-orm'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'
import { readPostgresRecord } from './record.js'
import { projectPostgresRecords } from './result-projection.js'
import { compilePostgresUpdate } from './update-compiler.js'

type RuntimeSetMutation = Extract<
	ExecutableOperationAst,
	{ readonly kind: 'delete-many' | 'update-many' }
>

/** Centralizes the adapter's discriminant-safe logical outcome boundary. */
export const createPostgresMutationOutcome = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	result: unknown,
	materializations: readonly DatabaseMutationMaterialization[],
): DatabaseOperationOutcome<TOperation> =>
	immutableRecord({
		materializations: immutableArray(materializations),
		result,
	}) as unknown as DatabaseOperationOutcome<TOperation>

/** Reads one retained logical identity only after verifying schema support. */
export const readPreparedRecordId = (
	schema: CompiledPostgresSchema,
	record: DatabaseLogicalRecord,
): unknown => {
	if (!Object.hasOwn(record, 'id')) {
		throw new TypeError('PostgreSQL prepared mutation target is missing its id')
	}

	resolveCompiledPostgresField(schema, 'id')
	return record.id
}

/** Reuses one retained identifier while preserving every accumulated constraint. */
export const createRetainedMutationTarget = (
	schema: CompiledPostgresSchema,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): SQL => {
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = and(eq(id, readPreparedRecordId(schema, previous)), constraint)

	if (target === undefined) {
		throw new TypeError(
			'PostgreSQL prepared mutation predicate could not be combined',
		)
	}

	return target
}

/** Applies an update to one locked row and returns its complete current state. */
export const executeRetainedUpdate = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	update: UpdateExpressionNode,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): Promise<DatabaseLogicalRecord> => {
	const [row] = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, update))
		.where(createRetainedMutationTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	if (row === undefined) {
		throw new TypeError(
			'PostgreSQL prepared update target disappeared before execution',
		)
	}

	return readPostgresRecord(schema, row)
}

/** Executes one retained set and restores logical order after a physical rewrite. */
export const executeRetainedSetBasedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeSetMutation,
	plan: DatabasePersistencePlan,
	targets: readonly DatabaseLogicalRecord[],
	constraint: SQL | undefined,
): Promise<DatabaseOperationOutcome<typeof operation>> => {
	if (targets.length === 0) return createPostgresMutationOutcome([], [])

	const id = resolveCompiledPostgresField(schema, 'id').column
	const targetIds = targets.map((target) =>
		readPreparedRecordId(schema, target),
	)
	const where = and(inArray(id, targetIds), constraint)

	if (where === undefined) {
		throw new TypeError(
			'PostgreSQL prepared set-based target could not be combined',
		)
	}

	const physicalIsUpdate = plan.kind === 'update-many'
	if (
		(plan.kind !== 'delete-many' && !physicalIsUpdate) ||
		(operation.kind === 'update-many' && !physicalIsUpdate)
	) {
		throw new TypeError(
			'PostgreSQL set-based mutation received an invalid plan',
		)
	}

	const rows = physicalIsUpdate
		? await client
				.update(schema.table)
				.set(compilePostgresUpdate(schema, plan.data.update))
				.where(where)
				.returning(compilePostgresSelection(schema))
		: await client
				.delete(schema.table)
				.where(where)
				.returning(compilePostgresSelection(schema))
	const records = rows.map((row) => readPostgresRecord(schema, row))

	if (records.length !== targets.length) {
		throw new TypeError(
			'PostgreSQL prepared set-based targets changed before execution',
		)
	}

	const recordsById = new Map<unknown, DatabaseLogicalRecord>()
	for (const record of records) {
		const recordId = readPreparedRecordId(schema, record)
		if (recordsById.has(recordId)) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation returned duplicate identities',
			)
		}
		recordsById.set(recordId, record)
	}

	const orderedRecords = targets.map((target) => {
		const record = recordsById.get(readPreparedRecordId(schema, target))
		if (record === undefined) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation returned an unknown identity',
			)
		}
		return record
	})
	const materializations = orderedRecords.map((record, index) => {
		const previous = targets[index]
		if (previous === undefined) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation lost its preimage order',
			)
		}
		return operation.kind === 'update-many'
			? immutableRecord({ current: record, kind: 'update' as const, previous })
			: immutableRecord({ kind: 'delete' as const, previous })
	})
	const resultRecords =
		operation.kind === 'delete-many' ? targets : orderedRecords

	return createPostgresMutationOutcome(
		projectPostgresRecords(resultRecords, plan.returning.selection),
		materializations,
	)
}

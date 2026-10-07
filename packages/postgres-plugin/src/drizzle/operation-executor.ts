import {
	FrameworkError,
	type DatabaseLogicalRecord,
	type ExecutableOperationAst,
	type QueryAst,
	type UniqueUpsertTargetNode,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { and, asc, count, eq, inArray, type SQL } from 'drizzle-orm'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'

import {
	compilePostgresQueryClauses,
	type CompiledPostgresQueryClauses,
} from '../query/clause-compiler.js'
import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import { required } from '../required.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
import { readDrizzleIndexColumns } from '../schema/index-compiler.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import {
	preparePostgresRecord,
	projectPostgresRecord,
	readPostgresRecord,
} from './record.js'
import { compilePostgresUpdate } from './update-compiler.js'

/** Narrows the executable operation union to the listed discriminants. */
export type PostgresOperation<TKind extends ExecutableOperationAst['kind']> =
	Extract<ExecutableOperationAst, { readonly kind: TKind }>

/** Binds one compiled schema to the client and relation compiler of a request. */
export interface PostgresStatementContext {
	readonly client: PostgresDrizzleClient
	readonly relationCompiler: PostgresRelationPredicateCompiler | undefined
	readonly schema: CompiledPostgresSchema
}

type TargetedMutation = PostgresOperation<
	'delete-many' | 'delete-one' | 'update-many' | 'update-one'
>

type TargetedMutationResult<TOperation extends TargetedMutation> =
	TOperation extends { readonly kind: 'delete-one' | 'update-one' }
		? DatabaseLogicalRecord | null
		: readonly DatabaseLogicalRecord[]

interface SelectOptions {
	readonly constraint: SQL | undefined
	readonly limit?: number
	readonly stableOrdering?: true
}

const buildSelect = (
	{ client, schema }: PostgresStatementContext,
	selection: Readonly<Record<string, PgColumn>>,
	clauses: CompiledPostgresQueryClauses,
	{ constraint, limit = clauses.limit, stableOrdering }: SelectOptions,
) => {
	const where = and(clauses.where, constraint)
	const orderBy =
		stableOrdering === true
			? [
					...clauses.orderBy,
					asc(resolveCompiledPostgresField(schema, 'id').column),
				]
			: clauses.orderBy
	let statement = client.select(selection).from(schema.table).$dynamic()

	if (where !== undefined) statement = statement.where(where)
	if (orderBy.length > 0) statement = statement.orderBy(...orderBy)
	if (limit !== undefined) statement = statement.limit(limit)
	if (clauses.offset !== undefined) statement = statement.offset(clauses.offset)

	return statement
}

const decodeRows = (
	schema: CompiledPostgresSchema,
	rows: readonly unknown[],
): readonly DatabaseLogicalRecord[] =>
	rows.map((row) => readPostgresRecord(schema, row))

/** Selects only target identities for aggregate reads and set-based writes. */
const selectTargetIds = (
	context: PostgresStatementContext,
	query: QueryAst,
	options: SelectOptions,
) => {
	const { relationCompiler, schema } = context
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(query, schema, relationCompiler)

	return { clauses, id, select: buildSelect(context, { id }, clauses, options) }
}

/** Persists one already normalized create candidate and decodes the complete row. */
export const executeCreateInput = async (
	{ client, schema }: PostgresStatementContext,
	input: unknown,
): Promise<DatabaseLogicalRecord> => {
	const [row] = await client
		.insert(schema.table)
		.values(preparePostgresRecord(schema, input))
		.returning(compilePostgresSelection(schema))

	return readPostgresRecord(
		schema,
		required(row, 'PostgreSQL create did not return the inserted row'),
	)
}

/** Inserts one validated collection in one statement and preserves RETURNING order. */
export const executeCreateMany = async (
	{ client, schema }: PostgresStatementContext,
	operation: PostgresOperation<'create-many'>,
): Promise<readonly DatabaseLogicalRecord[]> => {
	if (operation.inputs.length === 0) {
		return []
	}

	const inputIds = operation.inputs.map((input) => {
		if (!isPlainRecord(input) || !Object.hasOwn(input, 'id')) {
			throw new TypeError('PostgreSQL create-many input is missing its id')
		}

		return input.id
	})
	const rows = await client
		.insert(schema.table)
		.values(
			operation.inputs.map((input) => preparePostgresRecord(schema, input)),
		)
		.returning(compilePostgresSelection(schema))
	const decoded = decodeRows(schema, rows)

	if (decoded.length !== inputIds.length) {
		throw new TypeError('PostgreSQL create-many returned an invalid row count')
	}

	const recordsById = new Map<unknown, DatabaseLogicalRecord>()

	for (const record of decoded) {
		if (!Object.hasOwn(record, 'id') || recordsById.has(record.id)) {
			throw new TypeError('PostgreSQL create-many returned invalid identities')
		}

		recordsById.set(record.id, record)
	}

	return inputIds.map((id) =>
		required(
			recordsById.get(id),
			'PostgreSQL create-many returned an unknown identity',
		),
	)
}

/** Executes one query-targeted write without splitting update/delete cardinality mechanics. */
export const executePostgresTargetedMutation = async <
	const TOperation extends TargetedMutation,
>(
	context: PostgresStatementContext,
	operation: TOperation,
	constraint: SQL | undefined,
): Promise<TargetedMutationResult<TOperation>> => {
	const { client, schema } = context
	const singular =
		operation.kind === 'delete-one' || operation.kind === 'update-one'
	const { clauses, id, select } = selectTargetIds(context, operation.query, {
		constraint,
		...(singular ? { limit: 1 } : {}),
	})
	const selectedTarget = inArray(id, select)
	// Set-based writes reapply protected constraints at the final statement.
	const where = required(
		singular ? selectedTarget : and(selectedTarget, constraint),
		`PostgreSQL ${operation.kind} target could not be combined`,
	)
	const rows =
		operation.kind === 'update-many' || operation.kind === 'update-one'
			? await client
					.update(schema.table)
					.set(compilePostgresUpdate(schema, operation.update))
					.where(where)
					.returning(clauses.selection)
			: await client
					.delete(schema.table)
					.where(where)
					.returning(clauses.selection)
	const records = decodeRows(schema, rows)

	// The singular/plural split mirrors the conditional result type exactly.
	return (
		singular ? (records[0] ?? null) : records
	) as TargetedMutationResult<TOperation>
}

/** Locks matching complete targets for prepared mutations and upserts. */
const lockTargets = async (
	context: PostgresStatementContext,
	query: QueryAst,
	options: SelectOptions,
): Promise<readonly DatabaseLogicalRecord[]> => {
	const { relationCompiler, schema } = context

	return decodeRows(
		schema,
		await buildSelect(
			context,
			compilePostgresSelection(schema),
			compilePostgresQueryClauses(query, schema, relationCompiler),
			options,
		).for('update'),
	)
}

/** Locks one complete target for singular mutation and upsert preparation. */
export const lockPostgresMutationTarget = async (
	context: PostgresStatementContext,
	query: QueryAst,
	constraint: SQL | undefined,
): Promise<DatabaseLogicalRecord | null> =>
	(await lockTargets(context, query, { constraint, limit: 1 }))[0] ?? null

/** Locks complete set-based targets in one stable order for item hooks. */
export const lockPostgresSetBasedMutationTargets = (
	context: PostgresStatementContext,
	operation: PostgresOperation<'delete-many' | 'update-many'>,
	constraint: SQL | undefined,
): Promise<readonly DatabaseLogicalRecord[]> =>
	lockTargets(context, operation.query, { constraint, stableOrdering: true })

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
): SQL =>
	required(
		and(
			eq(
				resolveCompiledPostgresField(schema, 'id').column,
				readPreparedRecordId(schema, previous),
			),
			constraint,
		),
		'PostgreSQL prepared mutation predicate could not be combined',
	)

/** Applies an update to one locked row and returns its complete current state. */
export const executeRetainedUpdate = async (
	{ client, schema }: PostgresStatementContext,
	update: UpdateExpressionNode,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): Promise<DatabaseLogicalRecord> => {
	const [row] = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, update))
		.where(createRetainedMutationTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	return readPostgresRecord(
		schema,
		required(
			row,
			'PostgreSQL prepared update target disappeared before execution',
		),
	)
}

/** Attempts insertion; the caller resolves every conflict against the declared key. */
export const tryCreatePostgresUpsert = async (
	{ client, schema }: PostgresStatementContext,
	create: unknown,
	target: UniqueUpsertTargetNode,
): Promise<DatabaseLogicalRecord | null> => {
	const targetFields = target.fields
	const matchesTarget = (fields: readonly string[]): boolean =>
		fields.length === targetFields.length &&
		fields.every((fieldName, index) => fieldName === targetFields[index])
	const targetsUniqueIndex = getTableConfig(schema.table).indexes.some(
		(index) =>
			index.config.unique && matchesTarget(readDrizzleIndexColumns(index)),
	)

	if (!matchesTarget(['id']) && !targetsUniqueIndex) {
		throw new TypeError(
			'PostgreSQL upsert target must match id or one compiled unique index',
		)
	}

	for (const fieldName of targetFields) {
		resolveCompiledPostgresField(schema, fieldName)
	}

	// A concurrent insert can violate another unique index on the same row before
	// PostgreSQL checks the declared target. The caller re-locks that exact target
	// and rejects a conflict that does not resolve to its row.
	const [row] = await client
		.insert(schema.table)
		.values(preparePostgresRecord(schema, create))
		.onConflictDoNothing()
		.returning(compilePostgresSelection(schema))

	return row === undefined ? null : readPostgresRecord(schema, row)
}

/** Executes aggregate reads and mutations; object reads use the relational executor. */
export const executePostgresOperation = async (
	context: PostgresStatementContext,
	operation: Exclude<
		ExecutableOperationAst,
		{ readonly kind: 'find-many' | 'find-one' | 'get' }
	>,
	constraint: SQL | undefined,
): Promise<unknown> => {
	try {
		switch (operation.kind) {
			case 'count': {
				const { select } = selectTargetIds(context, operation.query, {
					constraint,
				})
				const [row] = await context.client
					.select({ value: count() })
					.from(select.as('ultimabase_count_target'))

				return required(row, 'PostgreSQL count query returned no aggregate row')
					.value
			}
			case 'exists': {
				const { select } = selectTargetIds(context, operation.query, {
					constraint,
					limit: 1,
				})

				return (await select).length > 0
			}
			case 'create-one':
				return projectPostgresRecord(
					await executeCreateInput(context, operation.input),
					operation.selection,
				)
			case 'create-many':
				return await executeCreateMany(context, operation)
			case 'update-one':
			case 'update-many':
			case 'delete-one':
			case 'delete-many':
				return await executePostgresTargetedMutation(
					context,
					operation,
					constraint,
				)
			case 'upsert-one':
			case 'upsert-many':
				throw new FrameworkError(
					'INTERNAL_ERROR',
					`PostgreSQL operation is not implemented yet: ${operation.kind}`,
					{
						publicMessage: 'The database operation is not available.',
						internalDetails: {
							kind: 'postgres-operation-not-implemented',
							operation: operation.kind,
						},
					},
				)
		}
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, operation.kind)
	}
}

import { FrameworkError } from '@ultimabase/core'
import type {
	ExecutableOperationAst,
	QueryAst,
	QueryFilterNode,
	UniqueUpsertTargetNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { and, asc, count, inArray, type SQL } from 'drizzle-orm'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/contracts.js'
import { readDrizzleIndexColumns } from '../schema/index-compiler.js'
import {
	compilePostgresQueryClauses,
	type CompiledPostgresQueryClauses,
} from '../query/clause-compiler.js'
import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import { preparePostgresRecord, readPostgresRecord } from './record.js'
import { compilePostgresUpdate } from './update-compiler.js'
import { projectPostgresRecord } from './result-projection.js'

type RuntimeOperation = ExecutableOperationAst
type RuntimeTargetedMutation = Extract<
	RuntimeOperation,
	{
		readonly kind: 'delete-many' | 'delete-one' | 'update-many' | 'update-one'
	}
>
type RuntimeQuery = QueryAst<
	SchemaDefinition,
	QueryFilterNode<SchemaDefinition>
>
type TargetedMutationResult<TOperation extends RuntimeTargetedMutation> =
	TOperation extends { readonly kind: 'delete-one' | 'update-one' }
		? Readonly<Record<string, unknown>> | null
		: readonly Readonly<Record<string, unknown>>[]

interface SelectOverrides {
	readonly constraint?: SQL | undefined
	readonly limit?: number
	readonly stableOrdering?: true
	readonly where?: SQL
}

export const readBuiltInQuery = (query: QueryAst): RuntimeQuery => {
	// Core normalizes the supported built-in filter nodes before adapter execution.
	return query as RuntimeQuery
}

const buildSelect = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	selection: Readonly<Record<string, PgColumn>>,
	clauses: CompiledPostgresQueryClauses,
	overrides: SelectOverrides = {},
) => {
	const where = and(clauses.where, overrides.constraint, overrides.where)
	const limit = overrides.limit ?? clauses.limit
	let statement = client.select(selection).from(schema.table).$dynamic()

	if (where !== undefined) {
		statement = statement.where(where)
	}
	const orderBy =
		overrides.stableOrdering === true
			? [
					...clauses.orderBy,
					asc(resolveCompiledPostgresField(schema, 'id').column),
				]
			: clauses.orderBy

	if (orderBy.length > 0) {
		statement = statement.orderBy(...orderBy)
	}
	if (limit !== undefined) {
		statement = statement.limit(limit)
	}
	if (clauses.offset !== undefined) {
		statement = statement.offset(clauses.offset)
	}

	return statement
}

const decodeRows = (
	schema: CompiledPostgresSchema,
	rows: readonly unknown[],
): readonly Readonly<Record<string, unknown>>[] =>
	rows.map((row) => readPostgresRecord(schema, row))

const executeCount = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'count' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<number> => {
	const query = readBuiltInQuery(operation.query)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(query, schema, relationCompiler)
	const target = buildSelect(client, schema, { id }, clauses, {
		constraint,
	}).as('ultimabase_count_target')
	const [row] = await client.select({ value: count() }).from(target)

	if (row === undefined) {
		throw new TypeError('PostgreSQL count query returned no aggregate row')
	}

	return row.value
}

const executeExists = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'exists' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<boolean> => {
	const query = readBuiltInQuery(operation.query)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(query, schema, relationCompiler)
	const rows = await buildSelect(client, schema, { id }, clauses, {
		constraint,
		limit: 1,
	})

	return rows.length > 0
}

/** Persists one already normalized create candidate and decodes the complete row. */
export const executeCreateInput = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	input: unknown,
): Promise<Readonly<Record<string, unknown>>> => {
	const values = preparePostgresRecord(schema, input)
	const selection = compilePostgresSelection(schema)
	const [row] = await client
		.insert(schema.table)
		.values(values)
		.returning(selection)

	if (row === undefined) {
		throw new TypeError('PostgreSQL create did not return the inserted row')
	}

	return readPostgresRecord(schema, row)
}

export const executeCreateOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'create-one' }>,
): Promise<Readonly<Record<string, unknown>>> => {
	const current = await executeCreateInput(client, schema, operation.input)

	return projectPostgresRecord(current, operation)
}

/** Inserts one validated collection in one statement and preserves RETURNING order. */
export const executeCreateMany = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'create-many' }>,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	if (operation.inputs.length === 0) {
		return []
	}

	const inputIds = operation.inputs.map((input) => {
		if (!isPlainRecord(input) || !Object.hasOwn(input, 'id')) {
			throw new TypeError('PostgreSQL create-many input is missing its id')
		}

		return input.id
	})
	const encodedInputs = operation.inputs.map((input) =>
		preparePostgresRecord(schema, input),
	)
	const rows = await client
		.insert(schema.table)
		.values(encodedInputs)
		.returning(compilePostgresSelection(schema))
	const decoded = decodeRows(schema, rows)

	if (decoded.length !== inputIds.length) {
		throw new TypeError('PostgreSQL create-many returned an invalid row count')
	}

	const recordsById = new Map<unknown, Readonly<Record<string, unknown>>>()

	for (const record of decoded) {
		if (!Object.hasOwn(record, 'id') || recordsById.has(record.id)) {
			throw new TypeError('PostgreSQL create-many returned invalid identities')
		}

		recordsById.set(record.id, record)
	}

	return inputIds.map((id) => {
		const record = recordsById.get(id)

		if (record === undefined) {
			throw new TypeError('PostgreSQL create-many returned an unknown identity')
		}

		return record
	})
}

/** Executes one query-targeted write without splitting update/delete cardinality mechanics. */
export const executePostgresTargetedMutation = async <
	const TOperation extends RuntimeTargetedMutation,
>(
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: TOperation,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<TargetedMutationResult<TOperation>> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(operation.query),
		schema,
		relationCompiler,
	)
	const singular =
		operation.kind === 'delete-one' || operation.kind === 'update-one'
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildSelect(client, schema, { id }, clauses, {
		constraint,
		...(singular ? { limit: 1 } : {}),
	})
	const selectedTarget = inArray(id, target)
	// Set-based writes reapply protected constraints at the final statement.
	const where = singular ? selectedTarget : and(selectedTarget, constraint)

	if (where === undefined) {
		throw new TypeError(
			`PostgreSQL ${operation.kind} target could not be combined`,
		)
	}

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

	return (
		singular ? (records[0] ?? null) : records
	) as TargetedMutationResult<TOperation>
}

/** Locks one complete target for singular mutation and upsert preparation. */
export const lockPostgresMutationTarget = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	query: QueryAst,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(query),
		schema,
		relationCompiler,
	)
	const [row] = await buildSelect(
		client,
		schema,
		compilePostgresSelection(schema),
		clauses,
		{ constraint, limit: 1 },
	).for('update')

	return row === undefined ? null : readPostgresRecord(schema, row)
}

/** Attempts insertion; the caller resolves every conflict against the declared key. */
export const tryCreatePostgresUpsert = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	create: unknown,
	target: UniqueUpsertTargetNode,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const targetFields = target.fields
	const targetsId = targetFields.length === 1 && targetFields[0] === 'id'
	const targetsUniqueIndex = getTableConfig(schema.table).indexes.some(
		(index) => {
			if (!index.config.unique) return false

			const indexFields = readDrizzleIndexColumns(index)

			return (
				indexFields.length === targetFields.length &&
				indexFields.every(
					(fieldName, index) => fieldName === targetFields[index],
				)
			)
		},
	)

	if (!targetsId && !targetsUniqueIndex) {
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

/** Locks complete set-based targets in one stable order for item hooks. */
export const lockPostgresSetBasedMutationTargets = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeOperation,
		{ readonly kind: 'delete-many' | 'update-many' }
	>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(operation.query),
		schema,
		relationCompiler,
	)
	const rows = await buildSelect(
		client,
		schema,
		compilePostgresSelection(schema),
		clauses,
		{ constraint, stableOrdering: true },
	).for('update')

	return decodeRows(schema, rows)
}

const createPendingOperationError = (
	operation: RuntimeOperation['kind'],
): FrameworkError<'INTERNAL_ERROR'> =>
	new FrameworkError(
		'INTERNAL_ERROR',
		`PostgreSQL operation is not implemented yet: ${operation}`,
		{
			publicMessage: 'The database operation is not available.',
			internalDetails: {
				kind: 'postgres-operation-not-implemented',
				operation,
			},
		},
	)

/** Executes aggregate reads and mutations; object reads use the relational executor. */
export const executePostgresOperation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Exclude<
		RuntimeOperation,
		{ readonly kind: 'find-many' | 'find-one' | 'get' }
	>,
	constraint?: SQL,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<unknown> => {
	try {
		switch (operation.kind) {
			case 'count':
				return await executeCount(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'exists':
				return await executeExists(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'create-one':
				return await executeCreateOne(client, schema, operation)
			case 'create-many':
				return await executeCreateMany(client, schema, operation)
			case 'update-one':
			case 'update-many':
			case 'delete-one':
			case 'delete-many':
				return await executePostgresTargetedMutation(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'upsert-one':
			case 'upsert-many':
				throw createPendingOperationError(operation.kind)
		}
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, operation.kind)
	}
}

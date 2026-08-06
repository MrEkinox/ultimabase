import { FrameworkError } from '@ultimabase/core'
import type {
	ExecutableOperationAst,
	QueryAst,
	QueryFilterNode,
	UniqueUpsertTargetNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { and, count, eq, inArray, type SQL } from 'drizzle-orm'
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import { readDrizzleIndexColumns } from '../schema/drizzle-table-metadata.js'
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
type RuntimeQuery = QueryAst<
	SchemaDefinition,
	QueryFilterNode<SchemaDefinition>
>

interface SelectOverrides {
	readonly constraint?: SQL | undefined
	readonly limit?: number
	readonly where?: SQL
}

export const readBuiltInQuery = (query: QueryAst): RuntimeQuery => {
	// Runtime currently normalizes built-in Query nodes; plugin expressions need an owning compiler later.
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
	if (clauses.orderBy.length > 0) {
		statement = statement.orderBy(...clauses.orderBy)
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

const executeFindMany = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'find-many' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
	const rows = await buildSelect(client, schema, clauses.selection, clauses, {
		constraint,
	})

	return decodeRows(schema, rows)
}

const executeFindOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'find-one' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
	const [row] = await buildSelect(client, schema, clauses.selection, clauses, {
		constraint,
		limit: 1,
	})

	return row === undefined ? null : readPostgresRecord(schema, row)
}

const executeGet = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'get' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
	const id = resolveCompiledPostgresField(schema, 'id')
	const [row] = await buildSelect(client, schema, clauses.selection, clauses, {
		constraint,
		limit: 1,
		where: eq(id.column, operation.id),
	})

	return row === undefined ? null : readPostgresRecord(schema, row)
}

const executeCount = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'count' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<number> => {
	const query = readBuiltInQuery(operation.query)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
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
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
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

const buildSingularTarget = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	clauses: CompiledPostgresQueryClauses,
	constraint: SQL | undefined,
) => {
	const id = resolveCompiledPostgresField(schema, 'id').column

	return buildSelect(client, schema, { id }, clauses, {
		constraint,
		limit: 1,
	})
}

/** Builds the exact id subquery shared by set-based updates and deletions. */
const buildManyTarget = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	clauses: CompiledPostgresQueryClauses,
	constraint: SQL | undefined,
) => {
	return buildSelect(
		client,
		schema,
		{ id: resolveCompiledPostgresField(schema, 'id').column },
		clauses,
		{ constraint },
	)
}

const executeUpdateOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'update-one' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildSingularTarget(client, schema, clauses, constraint)
	const [row] = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, operation.update))
		.where(inArray(id, target))
		.returning(clauses.selection)

	return row === undefined ? null : readPostgresRecord(schema, row)
}

const executeDeleteOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'delete-one' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
		relationCompiler,
	)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildSingularTarget(client, schema, clauses, constraint)
	const [row] = await client
		.delete(schema.table)
		.where(inArray(id, target))
		.returning(clauses.selection)

	return row === undefined ? null : readPostgresRecord(schema, row)
}

/** Updates every selected id and returns only the requested public columns. */
export const executeUpdateMany = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'update-many' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(operation.query),
		schema,
		undefined,
		relationCompiler,
	)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildManyTarget(client, schema, clauses, constraint)
	const where = and(inArray(id, target), constraint)

	if (where === undefined) {
		throw new TypeError('PostgreSQL update-many target could not be combined')
	}

	const rows = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, operation.update))
		.where(where)
		.returning(clauses.selection)

	return rows.map((row) => readPostgresRecord(schema, row))
}

/** Deletes every selected id and returns only the requested pre-delete columns. */
export const executeDeleteMany = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'delete-many' }>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(operation.query),
		schema,
		undefined,
		relationCompiler,
	)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildManyTarget(client, schema, clauses, constraint)
	const where = and(inArray(id, target), constraint)

	if (where === undefined) {
		throw new TypeError('PostgreSQL delete-many target could not be combined')
	}

	const rows = await client
		.delete(schema.table)
		.where(where)
		.returning(clauses.selection)

	return rows.map((row) => readPostgresRecord(schema, row))
}

/** Locks one complete unique target so upsert hooks can observe an exact branch. */
export const lockPostgresUpsertTarget = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	query: QueryAst,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(query),
		schema,
		undefined,
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

/** Attempts the create branch while restricting conflict handling to the declared key. */
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

	const targetColumns = target.fields.map(
		(fieldName) => resolveCompiledPostgresField(schema, fieldName).column,
	)
	const conflictTarget =
		targetColumns.length === 1 ? targetColumns[0] : targetColumns

	if (conflictTarget === undefined) {
		throw new TypeError('PostgreSQL upsert target has no fields')
	}

	const [row] = await client
		.insert(schema.table)
		.values(preparePostgresRecord(schema, create))
		.onConflictDoNothing({ target: conflictTarget })
		.returning(compilePostgresSelection(schema))

	return row === undefined ? null : readPostgresRecord(schema, row)
}

/** Locks one full deterministic target without exposing a physical row token. */
export const lockPostgresSingularMutationTarget = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeOperation,
		{ readonly kind: 'delete-one' | 'update-one' }
	>,
	constraint: SQL | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(
		query,
		schema,
		undefined,
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

/** Executes every operation owned by the singular PostgreSQL CRUD milestone. */
export const executePostgresOperation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeOperation,
	constraint?: SQL,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<unknown> => {
	try {
		switch (operation.kind) {
			case 'find-many':
				return await executeFindMany(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'find-one':
				return await executeFindOne(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'get':
				return await executeGet(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
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
				return await executeUpdateOne(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'update-many':
				return await executeUpdateMany(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'delete-one':
				return await executeDeleteOne(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				)
			case 'delete-many':
				return await executeDeleteMany(
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

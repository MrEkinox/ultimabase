import { FrameworkError } from '@ultimabase/core'
import type {
	ExecutableOperationAst,
	QueryAst,
	QueryFilterNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import { and, count, eq, inArray, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import {
	compilePostgresQueryClauses,
	type CompiledPostgresQueryClauses,
} from '../query/clause-compiler.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import { decodePostgresRecord, encodePostgresRecord } from './record-codec.js'
import { compilePostgresUpdate } from './update-compiler.js'

type RuntimeOperation = ExecutableOperationAst
type RuntimeQuery = QueryAst<
	SchemaDefinition,
	QueryFilterNode<SchemaDefinition>
>

interface SelectOverrides {
	readonly limit?: number
	readonly where?: SQL
}

const readBuiltInQuery = (query: QueryAst): RuntimeQuery => {
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
	const where = and(clauses.where, overrides.where)
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
	rows.map((row) => decodePostgresRecord(schema, row))

const executeFind = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'find' }>,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(query, schema)
	const rows = await buildSelect(client, schema, clauses.selection, clauses)

	return decodeRows(schema, rows)
}

const executeFirst = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'first' }>,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(query, schema)
	const [row] = await buildSelect(client, schema, clauses.selection, clauses, {
		limit: 1,
	})

	return row === undefined ? null : decodePostgresRecord(schema, row)
}

const executeGet = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'get' }>,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(query, schema)
	const id = resolveCompiledPostgresField(schema, 'id')
	const [row] = await buildSelect(client, schema, clauses.selection, clauses, {
		limit: 1,
		where: eq(id.column, id.codec.encode(operation.id)),
	})

	return row === undefined ? null : decodePostgresRecord(schema, row)
}

const executeCount = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'count' }>,
): Promise<number> => {
	const query = readBuiltInQuery(operation.query)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(query, schema)
	const target = buildSelect(client, schema, { id }, clauses).as(
		'ultimabase_count_target',
	)
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
): Promise<boolean> => {
	const query = readBuiltInQuery(operation.query)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const clauses = compilePostgresQueryClauses(query, schema)
	const rows = await buildSelect(client, schema, { id }, clauses, { limit: 1 })

	return rows.length > 0
}

const executeCreateOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'create-one' }>,
): Promise<Readonly<Record<string, unknown>>> => {
	const values = encodePostgresRecord(schema, operation.input)
	const selection = compilePostgresSelection(schema)
	const [row] = await client
		.insert(schema.table)
		.values(values)
		.returning(selection)

	if (row === undefined) {
		throw new TypeError('PostgreSQL create did not return the inserted row')
	}

	return decodePostgresRecord(schema, row)
}

const buildSingularTarget = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	clauses: CompiledPostgresQueryClauses,
) => {
	const id = resolveCompiledPostgresField(schema, 'id').column

	return buildSelect(client, schema, { id }, clauses, { limit: 1 })
}

const executeUpdateOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'update-one' }>,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(query, schema)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildSingularTarget(client, schema, clauses)
	const [row] = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, operation.update))
		.where(inArray(id, target))
		.returning(clauses.selection)

	return row === undefined ? null : decodePostgresRecord(schema, row)
}

const executeDeleteOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeOperation, { readonly kind: 'delete-one' }>,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const query = readBuiltInQuery(operation.query)
	const clauses = compilePostgresQueryClauses(query, schema)
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = buildSingularTarget(client, schema, clauses)
	const [row] = await client
		.delete(schema.table)
		.where(inArray(id, target))
		.returning(clauses.selection)

	return row === undefined ? null : decodePostgresRecord(schema, row)
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
): Promise<unknown> => {
	try {
		switch (operation.kind) {
			case 'find':
				return await executeFind(client, schema, operation)
			case 'first':
				return await executeFirst(client, schema, operation)
			case 'get':
				return await executeGet(client, schema, operation)
			case 'count':
				return await executeCount(client, schema, operation)
			case 'exists':
				return await executeExists(client, schema, operation)
			case 'create-one':
				return await executeCreateOne(client, schema, operation)
			case 'update-one':
				return await executeUpdateOne(client, schema, operation)
			case 'delete-one':
				return await executeDeleteOne(client, schema, operation)
			case 'create-many':
			case 'update-many':
			case 'upsert-one':
			case 'upsert-many':
			case 'delete-many':
				throw createPendingOperationError(operation.kind)
		}
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, operation.kind)
	}
}

import type { InferCreateInput, SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryWhereNode } from '../ast/contracts.js'
import { RelationPredicate } from '../filters/relation.js'
import type { QueryFilterNode } from '../filters/logical.js'
import {
	executeQueryDeleteMany,
	executeQueryDeleteOne,
	executeQueryUpdateMany,
	executeQueryUpdateOne,
	executeQueryUpsert,
	executeSchemaCreate,
	executeSchemaCreateMany,
	executeSchemaUpsertMany,
	hydrateQueryFromAst,
	Query,
} from '../query/query.js'
import { normalizeUniqueUpsertTarget } from './upsert.js'
import type {
	QueryBulkTerminalOptions,
	QueryBulkTerminalResult,
	QueryTerminalOptions,
} from './execution.js'
import type { InferQueryResult } from '../query/result.js'
import type { UpsertManyItemInput } from './upsert.js'
import type {
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaManyWhere,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertInput,
	SchemaUpsertManyItemInput,
	SchemaWhereFactory,
} from './schema-commands.js'

const assertExactCommandKeys: (
	input: unknown,
	keys: ReadonlySet<string>,
	path: string,
) => asserts input is Readonly<Record<string, unknown>> = (
	input,
	keys,
	path,
) => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	for (const key of Object.keys(input)) {
		if (!keys.has(key)) {
			throw new TypeError(`${path} contains unknown key: ${key}`)
		}
	}

	for (const key of keys) {
		if (!Object.hasOwn(input, key)) {
			throw new TypeError(`${path} must contain key: ${key}`)
		}
	}
}

const updateCommandKeys = new Set(['data', 'where'])
const deleteCommandKeys = new Set(['where'])
const upsertCommandKeys = new Set(['create', 'update', 'where'])

const isEmptyWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): boolean => expression.kind === 'constant' && expression.value

/** Converts one filter-only callback into the ordinary immutable Query AST. */
const createSchemaWhereQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereFactory<TSchema>,
): Query<TSchema> => {
	if (typeof where !== 'function') {
		throw new TypeError('schema command where must be a function')
	}

	const predicate = where(new RelationPredicate(schema))

	if (
		!(predicate instanceof RelationPredicate) ||
		predicate.schema !== schema
	) {
		throw new TypeError(
			'schema command where must return the supplied schema filter',
		)
	}

	const expression = predicate.toExpression()

	if (isEmptyWhereExpression(expression)) {
		throw new TypeError(
			"schema command where must contain a filter; use 'all' for every row",
		)
	}

	const initial = createQueryAst(schema)
	const whereNode: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
		kind: 'where',
		expression,
	})
	const ast = immutableRecord({
		...initial,
		where: whereNode,
	})

	return hydrateQueryFromAst<TSchema, never>(ast)
}

const createSchemaManyQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaManyWhere<TSchema>,
): Query<TSchema> =>
	where === 'all' ? new Query(schema) : createSchemaWhereQuery(schema, where)

const assertUniqueSchemaWhere = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	query: Query<TSchema>,
	path: string,
): void => {
	// The existing upsert target validator is the single source of truth for unique targeting.
	void normalizeUniqueUpsertTarget(schema, query.ast, path)
}

/** Creates one row through the schema class rather than a selection Query. */
export const createSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: InferCreateInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<InferQueryResult<TSchema>> =>
	executeSchemaCreate(schema, input, options)

/** Creates ordered rows through the schema class. */
export const createSchemaRecords = <
	const TSchema extends SchemaDefinition,
	const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
>(
	schema: TSchema,
	inputs: readonly InferCreateInput<TSchema>[],
	options?: TOptions & QueryBulkTerminalOptions,
): Promise<QueryBulkTerminalResult<InferQueryResult<TSchema>, TOptions>> =>
	executeSchemaCreateMany(schema, inputs, options)

/** Updates one exact unique target through the schema class. */
export const updateSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateOneInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<InferQueryResult<TSchema> | null> => {
	assertExactCommandKeys(input, updateCommandKeys, 'schema updateOne input')
	const query = createSchemaWhereQuery(schema, input.where)

	assertUniqueSchemaWhere(schema, query, 'schema updateOne where')

	return executeQueryUpdateOne(query, input.data, options)
}

/** Updates one explicit filtered set through the schema class. */
export const updateSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateManyInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<number> => {
	assertExactCommandKeys(input, updateCommandKeys, 'schema updateMany input')

	return executeQueryUpdateMany(
		createSchemaManyQuery(schema, input.where),
		input.data,
		options,
	)
}

/** Upserts one exact unique target through the schema class. */
export const upsertSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpsertInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<InferQueryResult<TSchema>> => {
	assertExactCommandKeys(input, upsertCommandKeys, 'schema upsert input')
	const query = createSchemaWhereQuery(schema, input.where)

	return executeQueryUpsert(
		query,
		{ create: input.create, update: input.update },
		options,
	)
}

/** Upserts independently targeted items through the schema class. */
export const upsertSchemaRecords = <
	const TSchema extends SchemaDefinition,
	const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
>(
	schema: TSchema,
	inputs: readonly SchemaUpsertManyItemInput<TSchema>[],
	options?: TOptions & QueryBulkTerminalOptions,
): Promise<QueryBulkTerminalResult<InferQueryResult<TSchema>, TOptions>> => {
	const untrustedInputs: unknown = inputs

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('schema upsertMany input must be an array')
	}

	const normalizedInputs = immutableArray(
		inputs.map((input, index): UpsertManyItemInput<TSchema> => {
			assertExactCommandKeys(
				input,
				upsertCommandKeys,
				`schema upsertMany input[${String(index)}]`,
			)

			return immutableRecord({
				query: createSchemaWhereQuery(schema, input.where),
				create: input.create,
				update: input.update,
			})
		}),
	)

	return executeSchemaUpsertMany(schema, normalizedInputs, options)
}

/** Deletes one exact unique target through the schema class. */
export const deleteSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteOneInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<InferQueryResult<TSchema> | null> => {
	assertExactCommandKeys(input, deleteCommandKeys, 'schema deleteOne input')
	const query = createSchemaWhereQuery(schema, input.where)

	assertUniqueSchemaWhere(schema, query, 'schema deleteOne where')

	return executeQueryDeleteOne(query, options)
}

/** Deletes one explicit filtered set through the schema class. */
export const deleteSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteManyInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<number> => {
	assertExactCommandKeys(input, deleteCommandKeys, 'schema deleteMany input')

	return executeQueryDeleteMany(
		createSchemaManyQuery(schema, input.where),
		options,
	)
}

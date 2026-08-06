import type { InferCreateInput, SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryWhereNode } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput } from '../filters/where.js'
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
	SchemaDeleteManyExecutionInput,
	SchemaDeleteOneExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaManyWhere,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertInput,
	SchemaUpsertManyItemInput,
	SchemaWhereFactory,
} from './schema-commands.js'
import {
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
	type QuerySelection,
} from '../clauses/selection.js'
import type { QueryFieldName } from '../ast/contracts.js'

const assertExactCommandKeys: (
	input: unknown,
	keys: ReadonlySet<string>,
	path: string,
	optionalKeys?: ReadonlySet<string>,
) => asserts input is Readonly<Record<string, unknown>> = (
	input,
	keys,
	path,
	optionalKeys = new Set(),
) => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	for (const key of Object.keys(input)) {
		if (!keys.has(key) && !optionalKeys.has(key)) {
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
const updateOneOptionalCommandKeys = new Set(['select'])
const updateManyOptionalCommandKeys = new Set(['select'])
const createCommandKeys = new Set(['data'])
const createOneOptionalCommandKeys = new Set(['select'])
const deleteCommandKeys = new Set(['where'])
const deleteOneOptionalCommandKeys = new Set(['select'])
const deleteManyOptionalCommandKeys = new Set(['select'])
const upsertCommandKeys = new Set(['create', 'update', 'where'])

const isEmptyWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): boolean => expression.kind === 'constant' && expression.value

/** Converts one canonical where source into the ordinary immutable Query AST. */
const createSchemaWhereQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereFactory<TSchema>,
): Query<TSchema> => {
	const expression = resolveWhereInput(schema, where)

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

/** Applies the explicit bulk projection or the safe identifier-only default. */
const createSchemaManyResultQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaManyWhere<TSchema>,
	selection: QuerySelection<TSchema> | undefined,
): Query<TSchema, QueryFieldName<TSchema>> => {
	const query = createSchemaManyQuery(schema, where)
	const normalizedSelection =
		selection === undefined
			? normalizeQuerySelectedFields(schema, ['id' as QueryFieldName<TSchema>])
			: normalizeQuerySelection(schema, selection)

	return hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({ ...query.ast, selection: normalizedSelection }),
	)
}

/** Creates one row through the schema class rather than a selection Query. */
export const createSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<object> => {
	assertExactCommandKeys(
		input,
		createCommandKeys,
		'schema create input',
		createOneOptionalCommandKeys,
	)

	return executeSchemaCreate(schema, input, options)
}

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
	input: SchemaUpdateOneExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<object | null> => {
	assertExactCommandKeys(
		input,
		updateCommandKeys,
		'schema updateOne input',
		updateOneOptionalCommandKeys,
	)
	const query = createSchemaWhereQuery(schema, input.where)

	assertUniqueSchemaWhere(schema, query, 'schema updateOne where')

	if (input.select === undefined) {
		return executeQueryUpdateOne(query, input.data, options)
	}

	const selectedQuery = hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({
			...query.ast,
			selection: normalizeQuerySelection(schema, input.select),
		}),
	)

	return executeQueryUpdateOne(selectedQuery, input.data, options)
}

/** Updates one explicit filtered set through the schema class. */
export const updateSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateManyExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		updateCommandKeys,
		'schema updateMany input',
		updateManyOptionalCommandKeys,
	)
	const query = createSchemaManyResultQuery(schema, input.where, input.select)

	return executeQueryUpdateMany(query, input.data, options)
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
	input: SchemaDeleteOneExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<object | null> => {
	assertExactCommandKeys(
		input,
		deleteCommandKeys,
		'schema deleteOne input',
		deleteOneOptionalCommandKeys,
	)
	const query = createSchemaWhereQuery(schema, input.where)

	assertUniqueSchemaWhere(schema, query, 'schema deleteOne where')

	if (input.select === undefined) {
		return executeQueryDeleteOne(query, options)
	}

	const selectedQuery = hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({
			...query.ast,
			selection: normalizeQuerySelection(schema, input.select),
		}),
	)

	return executeQueryDeleteOne(selectedQuery, options)
}

/** Deletes one explicit filtered set through the schema class. */
export const deleteSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteManyExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		deleteCommandKeys,
		'schema deleteMany input',
		deleteManyOptionalCommandKeys,
	)
	const query = createSchemaManyResultQuery(schema, input.where, input.select)

	return executeQueryDeleteMany(query, options)
}

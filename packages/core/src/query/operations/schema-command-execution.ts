import type { SchemaDefinition } from '../../schema/index.js'
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
	executeQueryUpsertOne,
	executeSchemaCreateOne,
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
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaManyWhere,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertOneExecutionInput,
	SchemaUpsertManyExecutionInput,
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
const createManyOptionalCommandKeys = new Set(['select'])
const deleteCommandKeys = new Set(['where'])
const deleteOneOptionalCommandKeys = new Set(['select'])
const deleteManyOptionalCommandKeys = new Set(['select'])
const upsertCommandKeys = new Set(['create', 'update', 'where'])
const upsertOptionalCommandKeys = new Set(['select'])
const upsertManyCommandKeys = new Set(['data'])
const upsertManyOptionalCommandKeys = new Set(['select'])

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

	return executeSchemaCreateOne(schema, input, options)
}

/** Creates ordered rows through the schema class. */
export const createSchemaRecords = <
	const TSchema extends SchemaDefinition,
	const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
>(
	schema: TSchema,
	input: SchemaCreateManyExecutionInput<TSchema>,
	options?: TOptions & QueryBulkTerminalOptions,
): Promise<
	QueryBulkTerminalResult<
		InferQueryResult<TSchema, QueryFieldName<TSchema>>,
		TOptions
	>
> => {
	assertExactCommandKeys(
		input,
		createCommandKeys,
		'schema createMany input',
		createManyOptionalCommandKeys,
	)

	if (!isUnknownArray(input.data)) {
		throw new TypeError('schema createMany data must be an array')
	}

	return executeSchemaCreateMany(schema, input, options)
}

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
	input: SchemaUpsertOneExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
): Promise<object> => {
	assertExactCommandKeys(
		input,
		upsertCommandKeys,
		'schema upsert input',
		upsertOptionalCommandKeys,
	)
	const query = createSchemaWhereQuery(schema, input.where)

	if (input.select === undefined) {
		return executeQueryUpsertOne(
			query,
			{ create: input.create, update: input.update },
			options,
		)
	}

	const selectedQuery = hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({
			...query.ast,
			selection: normalizeQuerySelection(schema, input.select),
		}),
	)

	return executeQueryUpsertOne(
		selectedQuery,
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
	input: SchemaUpsertManyExecutionInput<TSchema>,
	options?: TOptions & QueryBulkTerminalOptions,
): Promise<
	QueryBulkTerminalResult<
		InferQueryResult<TSchema, QueryFieldName<TSchema>>,
		TOptions
	>
> => {
	assertExactCommandKeys(
		input,
		upsertManyCommandKeys,
		'schema upsertMany input',
		upsertManyOptionalCommandKeys,
	)
	const untrustedInputs: unknown = input.data

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('schema upsertMany data must be an array')
	}

	const normalizedInputs = immutableArray(
		input.data.map((item, index): UpsertManyItemInput<TSchema> => {
			assertExactCommandKeys(
				item,
				upsertCommandKeys,
				`schema upsertMany data[${String(index)}]`,
			)

			return immutableRecord({
				query: createSchemaWhereQuery(schema, item.where),
				create: item.create,
				update: item.update,
			})
		}),
	)

	return executeSchemaUpsertMany(
		schema,
		normalizedInputs,
		input.select,
		options,
	)
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

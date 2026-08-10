import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type {
	QueryAst,
	QuerySelectionNode,
	QueryWhereNode,
} from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput } from '../filters/where.js'
import type { QueryBuilder } from '../query/query.js'
import {
	executeQueryDeleteOne,
	executeQueryUpdateOne,
	executeQueryUpsertOne,
	executeSchemaCreateOne,
	hydrateQueryFromAst,
} from '../query/query.js'
import { queryFromFindOneInput } from '../query/input.js'
import { normalizeUniqueUpsertTarget, normalizeUpsertInput } from './upsert.js'
import {
	executeOperationBatch,
	normalizeOperationOptions,
	type OperationBatchProjection,
} from './execution.js'
import type { OperationOptions } from './options.js'
import type { QueryResult } from '../query/result.js'
import type {
	SchemaDeleteManyExecutionInput,
	SchemaDeleteOneExecutionInput,
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertOneExecutionInput,
	SchemaUpsertManyExecutionInput,
	SchemaWhereInput,
} from './schema-commands.js'
import {
	emptyQuerySelection,
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
} from '../clauses/selection.js'
import type { QueryFieldName } from '../ast/contracts.js'
import type {
	CreateOneOperationAst,
	DeleteOneOperationAst,
	FindManyOperationAst,
	OperationObjectId,
	UpdateOneOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type { UpdateExpression } from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'

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
const updateManyCommandKeys = new Set(['data'])
const updateOneCommandKeys = new Set(['data'])
const updateOneOptionalCommandKeys = new Set([
	'id',
	'include',
	'select',
	'where',
])
const updateManyOptionalCommandKeys = new Set(['include', 'select'])
const createCommandKeys = new Set(['data'])
const createOneOptionalCommandKeys = new Set(['include', 'select'])
const createManyOptionalCommandKeys = new Set(['include', 'select'])
const deleteCommandKeys = new Set(['where'])
const deleteOneCommandKeys = new Set<string>()
const deleteOneOptionalCommandKeys = new Set(['id', 'select', 'where'])
const deleteManyOptionalCommandKeys = new Set(['select'])
const upsertCommandKeys = new Set(['create', 'update', 'where'])
const upsertOptionalCommandKeys = new Set(['select'])
const upsertManyCommandKeys = new Set(['data'])
const upsertManyOptionalCommandKeys = new Set(['select'])

const isEmptyWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): boolean => expression.kind === 'constant' && expression.value

/** Creates the canonical direct filter represented by one singular identifier alias. */
const createSchemaObjectIdWhere = <const TSchema extends SchemaDefinition>(
	id: OperationObjectId<TSchema>,
): SchemaWhereInput<TSchema> =>
	immutableRecord({
		id: immutableRecord({ eq: id }),
	})

/** Resolves one exclusive public target before constructing a Query or operation AST. */
const normalizeSchemaSingularTarget = <const TSchema extends SchemaDefinition>(
	input:
		| SchemaUpdateOneExecutionInput<TSchema>
		| SchemaDeleteOneExecutionInput<TSchema>,
	path: string,
): SchemaWhereInput<TSchema> => {
	const hasId = Object.hasOwn(input, 'id')
	const hasWhere = Object.hasOwn(input, 'where')

	if (hasId === hasWhere) {
		throw new TypeError(`${path} must contain exactly one of id or where`)
	}

	if (hasWhere) {
		const where = input.where

		if (where === undefined) {
			throw new TypeError(`${path}.where must be an object`)
		}

		return where
	}

	const id: unknown = input.id

	if (typeof id !== 'string') {
		throw new TypeError(`${path}.id must be a string`)
	}

	return createSchemaObjectIdWhere<TSchema>(id as OperationObjectId<TSchema>)
}

/** Converts one canonical where source into the ordinary immutable QueryBuilder AST. */
const createSchemaWhereQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereInput<TSchema>,
): QueryBuilder<TSchema> => {
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

const assertUniqueSchemaWhere = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	query: QueryBuilder<TSchema>,
	path: string,
): void => {
	// The existing upsert target validator is the single source of truth for unique targeting.
	void normalizeUniqueUpsertTarget(schema, query.ast, path)
}

/** Applies one batch projection to an exact unique target. */
const createSchemaBatchResultQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereInput<TSchema>,
	selection: QuerySelectionNode<QueryFieldName<TSchema>>,
): QueryBuilder<TSchema, QueryFieldName<TSchema>> => {
	const query = createSchemaWhereQuery(schema, where)

	assertUniqueSchemaWhere(schema, query, 'schema batch item where')

	return hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({ ...query.ast, selection }),
	)
}

/** Retains one common nested projection outside itemized mutation operations. */
const createBatchProjection = <const TSchema extends SchemaDefinition>(
	query: QueryAst<TSchema>,
): OperationBatchProjection =>
	immutableRecord({
		operation: immutableRecord({
			kind: 'find-many' as const,
			query,
		}) as unknown as FindManyOperationAst<SchemaDefinition>,
	})

/** Creates one row through the schema class rather than a selection QueryBuilder. */
export const createSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: OperationOptions,
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
export const createSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly QueryResult<TSchema, QueryFieldName<TSchema>>[]> => {
	assertExactCommandKeys(
		input,
		createCommandKeys,
		'schema createMany input',
		createManyOptionalCommandKeys,
	)

	if (!isUnknownArray(input.data)) {
		throw new TypeError('schema createMany data must be an array')
	}

	const projectionQuery =
		input.include === undefined
			? undefined
			: queryFromFindOneInput(schema, {
					include: input.include,
					...(input.select === undefined ? {} : { select: input.select }),
				})
	const selection =
		projectionQuery?.ast.selection ??
		(input.select === undefined
			? emptyQuerySelection
			: normalizeQuerySelection(schema, input.select))
	const schemaNode = createQueryAst(schema).schema
	const entries = immutableArray(
		input.data.map((data) => {
			const operation: CreateOneOperationAst<
				TSchema,
				QueryFieldName<TSchema>
			> = immutableRecord({
				input: data,
				kind: 'create-one',
				schema: schemaNode,
				selection,
			})

			return immutableRecord({ operation })
		}),
	)

	const projection =
		projectionQuery !== undefined &&
		projectionQuery.ast.inclusion.fields.length > 0
			? createBatchProjection(projectionQuery.ast)
			: undefined

	return executeOperationBatch(
		entries,
		normalizeOperationOptions(options),
		projection,
	)
}

/** Updates one exact unique target through the schema class. */
export const updateSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object | null> => {
	assertExactCommandKeys(
		input,
		updateOneCommandKeys,
		'schema updateOne input',
		updateOneOptionalCommandKeys,
	)
	const where = normalizeSchemaSingularTarget(input, 'schema updateOne input')
	const query = createSchemaWhereQuery(schema, where)

	assertUniqueSchemaWhere(schema, query, 'schema updateOne where')

	if (input.select === undefined && input.include === undefined) {
		return executeQueryUpdateOne(query, input.data, options)
	}
	const projection = queryFromFindOneInput(schema, {
		...(input.include === undefined ? {} : { include: input.include }),
		...(input.select === undefined ? {} : { select: input.select }),
	})

	const selectedQuery = hydrateQueryFromAst<TSchema, QueryFieldName<TSchema>>(
		immutableRecord({
			...query.ast,
			inclusion: projection.ast.inclusion,
			selection: projection.ast.selection,
		}),
	)

	return executeQueryUpdateOne(selectedQuery, input.data, options)
}

/** Updates independently targeted rows through one atomic batch. */
export const updateSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		updateManyCommandKeys,
		'schema updateMany input',
		updateManyOptionalCommandKeys,
	)
	const untrustedInputs: unknown = input.data

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('schema updateMany data must be an array')
	}
	const projectionQuery =
		input.include === undefined
			? undefined
			: queryFromFindOneInput(schema, {
					include: input.include,
					select: input.select ?? { id: true },
				})
	const selection =
		projectionQuery?.ast.selection ??
		(input.select === undefined
			? normalizeQuerySelectedFields(schema, ['id'])
			: normalizeQuerySelection(schema, input.select))

	const entries = immutableArray(
		input.data.map((item, index) => {
			assertExactCommandKeys(
				item,
				updateCommandKeys,
				`schema updateMany data[${String(index)}]`,
			)
			const query = createSchemaBatchResultQuery(schema, item.where, selection)
			const operation: UpdateOneOperationAst<
				TSchema,
				UpdateExpression<TSchema>,
				QueryFilterNode<TSchema>,
				QueryFieldName<TSchema>
			> = immutableRecord({
				kind: 'update-one',
				query: query.ast,
				update: normalizeUpdateExpression(schema, item.data),
			})

			return immutableRecord({ operation, requireResult: true as const })
		}),
	)

	const projection =
		projectionQuery !== undefined &&
		projectionQuery.ast.inclusion.fields.length > 0
			? createBatchProjection(projectionQuery.ast)
			: undefined

	return executeOperationBatch(
		entries,
		normalizeOperationOptions(options),
		projection,
	) as unknown as Promise<readonly object[]>
}

/** Upserts one exact unique target through the schema class. */
export const upsertSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpsertOneExecutionInput<TSchema>,
	options?: OperationOptions,
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
export const upsertSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpsertManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly QueryResult<TSchema, QueryFieldName<TSchema>>[]> => {
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

	const selection =
		input.select === undefined
			? emptyQuerySelection
			: normalizeQuerySelection(schema, input.select)
	const entries = immutableArray(
		input.data.map((item, index) => {
			assertExactCommandKeys(
				item,
				upsertCommandKeys,
				`schema upsertMany data[${String(index)}]`,
			)

			const query = createSchemaWhereQuery(schema, item.where)
			const operation: UpsertOneOperationAst<
				TSchema,
				UpdateExpression<TSchema>,
				QueryFilterNode<TSchema>,
				QueryFieldName<TSchema>
			> = immutableRecord({
				...normalizeUpsertInput(schema, {
					create: item.create,
					update: item.update,
				}),
				kind: 'upsert-one',
				query: immutableRecord({ ...query.ast, selection }),
				target: normalizeUniqueUpsertTarget(
					schema,
					query.ast,
					`schema upsertMany data[${String(index)}].where`,
				),
			})

			return immutableRecord({ operation })
		}),
	)

	return executeOperationBatch(entries, normalizeOperationOptions(options))
}

/** Deletes one exact unique target through the schema class. */
export const deleteSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object | null> => {
	assertExactCommandKeys(
		input,
		deleteOneCommandKeys,
		'schema deleteOne input',
		deleteOneOptionalCommandKeys,
	)
	const where = normalizeSchemaSingularTarget(input, 'schema deleteOne input')
	const query = createSchemaWhereQuery(schema, where)

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

/** Deletes independently targeted rows through one atomic batch. */
export const deleteSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		deleteCommandKeys,
		'schema deleteMany input',
		deleteManyOptionalCommandKeys,
	)
	const untrustedTargets: unknown = input.where

	if (!isUnknownArray(untrustedTargets)) {
		throw new TypeError('schema deleteMany where must be an array')
	}

	const entries = immutableArray(
		input.where.map((where) => {
			const selection =
				input.select === undefined
					? normalizeQuerySelectedFields(schema, ['id'])
					: normalizeQuerySelection(schema, input.select)
			const query = createSchemaBatchResultQuery(schema, where, selection)
			const operation: DeleteOneOperationAst<
				TSchema,
				QueryFilterNode<TSchema>,
				QueryFieldName<TSchema>
			> = immutableRecord({ kind: 'delete-one', query: query.ast })

			return immutableRecord({ operation, requireResult: true as const })
		}),
	)

	return executeOperationBatch(
		entries,
		normalizeOperationOptions(options),
	) as unknown as Promise<readonly object[]>
}

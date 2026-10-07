import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createQueryAst } from '../ast/factory.js'
import type { QueryAst, QuerySelectionNode } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput } from '../filters/where.js'
import {
	executeQueryDeleteOne,
	executeQueryUpdateOne,
	executeQueryUpsertOne,
	executeSchemaCreateOne,
} from '../query/operation-execution.js'
import {
	queryFromFindOneInput,
	type NormalizedQueryInput,
} from '../query/input.js'
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

type CommandKeyContract = readonly [
	required: readonly string[],
	optional?: readonly string[],
]

const commandKeyContracts = {
	dataProjection: [['data'], ['include', 'select']],
	deleteMany: [['where'], ['select']],
	deleteOne: [[], ['id', 'select', 'where']],
	updateItem: [['data', 'where']],
	updateOne: [['data'], ['id', 'include', 'select', 'where']],
	upsertItem: [['create', 'update', 'where']],
	upsertMany: [['data'], ['select']],
	upsertOne: [['create', 'update', 'where'], ['select']],
} as const satisfies Record<string, CommandKeyContract>

const assertExactCommandKeys: (
	input: unknown,
	contract: CommandKeyContract,
	path: string,
) => asserts input is Readonly<Record<string, unknown>> = (
	input,
	[requiredKeys, optionalKeys = []],
	path,
) => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	for (const key of Object.keys(input)) {
		if (!requiredKeys.includes(key) && !optionalKeys.includes(key)) {
			throw new TypeError(`${path} contains unknown key: ${key}`)
		}
	}

	for (const key of requiredKeys) {
		if (!Object.hasOwn(input, key)) {
			throw new TypeError(`${path} must contain key: ${key}`)
		}
	}
}

const assertCommandArray: (
	value: unknown,
	path: string,
) => asserts value is readonly unknown[] = (value, path) => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be an array`)
	}
}

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

/** Normalizes a schema target directly without allocating a read builder. */
const createSchemaWhereQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereInput<TSchema>,
): NormalizedQueryInput<TSchema> => {
	const expression = resolveWhereInput(schema, where)

	if (isEmptyWhereExpression(expression)) {
		throw new TypeError(
			"schema command where must contain a filter; use 'all' for every row",
		)
	}

	const ast = immutableRecord({
		...createQueryAst(schema),
		where: immutableRecord({ kind: 'where' as const, expression }),
	})

	return immutableRecord({ ast, schema })
}

const assertUniqueSchemaWhere = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	query: NormalizedQueryInput<TSchema>,
	path: string,
): void => {
	// The existing upsert target validator is the single source of truth for unique targeting.
	void normalizeUniqueUpsertTarget(schema, query.ast, path)
}

/** Keeps schema projection changes on the same inert normalized input. */
const projectSchemaQuery = <const TSchema extends SchemaDefinition>(
	query: NormalizedQueryInput<TSchema>,
	selection: QuerySelectionNode<QueryFieldName<TSchema>>,
	inclusion = query.ast.inclusion,
): NormalizedQueryInput<TSchema, QueryFieldName<TSchema>> =>
	immutableRecord({
		ast: immutableRecord({ ...query.ast, inclusion, selection }),
		schema: query.schema,
	})

/** Applies one batch projection to an exact unique target. */
const createSchemaBatchResultQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereInput<TSchema>,
	selection: QuerySelectionNode<QueryFieldName<TSchema>>,
): NormalizedQueryInput<TSchema, QueryFieldName<TSchema>> => {
	const query = createSchemaWhereQuery(schema, where)

	assertUniqueSchemaWhere(schema, query, 'schema batch item where')

	return projectSchemaQuery(query, selection)
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
	inputMode: 'flat' | 'nested' = 'nested',
): Promise<object> => {
	assertExactCommandKeys(
		input,
		commandKeyContracts.dataProjection,
		'schema create input',
	)

	return executeSchemaCreateOne(schema, input, options, inputMode)
}

/** Creates ordered rows through the schema class. */
export const createSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly QueryResult<TSchema, QueryFieldName<TSchema>>[]> => {
	assertExactCommandKeys(
		input,
		commandKeyContracts.dataProjection,
		'schema createMany input',
	)
	assertCommandArray(input.data, 'schema createMany data')

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
		commandKeyContracts.updateOne,
		'schema updateOne input',
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

	const selectedQuery = projectSchemaQuery(
		query,
		projection.ast.selection,
		projection.ast.inclusion,
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
		commandKeyContracts.dataProjection,
		'schema updateMany input',
	)
	assertCommandArray(input.data, 'schema updateMany data')
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
				commandKeyContracts.updateItem,
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
		commandKeyContracts.upsertOne,
		'schema upsert input',
	)
	const query = createSchemaWhereQuery(schema, input.where)

	if (input.select === undefined) {
		return executeQueryUpsertOne(
			query,
			{ create: input.create, update: input.update },
			options,
		)
	}

	const selectedQuery = projectSchemaQuery(
		query,
		normalizeQuerySelection(schema, input.select),
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
		commandKeyContracts.upsertMany,
		'schema upsertMany input',
	)
	assertCommandArray(input.data, 'schema upsertMany data')

	const selection =
		input.select === undefined
			? emptyQuerySelection
			: normalizeQuerySelection(schema, input.select)
	const entries = immutableArray(
		input.data.map((item, index) => {
			assertExactCommandKeys(
				item,
				commandKeyContracts.upsertItem,
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
		commandKeyContracts.deleteOne,
		'schema deleteOne input',
	)
	const where = normalizeSchemaSingularTarget(input, 'schema deleteOne input')
	const query = createSchemaWhereQuery(schema, where)

	assertUniqueSchemaWhere(schema, query, 'schema deleteOne where')

	if (input.select === undefined) {
		return executeQueryDeleteOne(query, options)
	}

	const selectedQuery = projectSchemaQuery(
		query,
		normalizeQuerySelection(schema, input.select),
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
		commandKeyContracts.deleteMany,
		'schema deleteMany input',
	)
	assertCommandArray(input.where, 'schema deleteMany where')

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

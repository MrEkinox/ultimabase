import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { assertExactCommandKeys } from '../../exact-object-validation.js'

import type { QueryFieldName, QuerySelectionNode } from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import {
	emptyQuerySelection,
	normalizeQuerySelection,
	type QuerySelection,
} from '../clauses/selection.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput } from '../filters/where.js'
import {
	queryFromFindOneInput,
	type FindOneInput,
	type NormalizedQueryInput,
} from '../query/input.js'
import {
	executeQueryDeleteOne,
	executeQueryUpdateOne,
	executeQueryUpsertOne,
	executeSchemaCreateOne,
} from '../query/operation-execution.js'
import type { QueryResult } from '../query/result.js'
import type { UpdateExpression } from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import type {
	CreateOneOperationAst,
	DeleteOneOperationAst,
	FindManyOperationAst,
	UpdateOneOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import {
	executeOperationBatch,
	normalizeOperationOptions,
	type OperationBatchEntry,
	type OperationBatchProjection,
} from './execution.js'
import type { OperationOptions } from './options.js'
import type {
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaDeleteManyExecutionInput,
	SchemaDeleteOneExecutionInput,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertManyExecutionInput,
	SchemaUpsertOneExecutionInput,
	SchemaWhereInput,
} from './schema-commands.js'
import {
	normalizeUniqueUpsertTarget,
	normalizeUpsertInput,
	type UpsertInput,
} from './upsert.js'
import {
	normalizeCollectionLinks,
	rejectLinkFailures,
} from './collection-links.js'
import {
	markLinkTargetOperation,
	type LinkTargetMarker,
} from '../../schema/nested-writes/operation-markers.js'

type SchemaQuery<TSchema extends SchemaDefinition> = NormalizedQueryInput<
	TSchema,
	QueryFieldName<TSchema>
>

const assertCommandArray: (
	value: unknown,
	path: string,
) => asserts value is readonly unknown[] = (value, path) => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be an array`)
	}
}

/** Normalizes one mutation target directly, without allocating a read builder. */
const createSchemaWhereQuery = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	where: SchemaWhereInput<TSchema>,
	uniquePath?: string,
): SchemaQuery<TSchema> => {
	const expression = resolveWhereInput(schema, where)

	if (expression.kind === 'constant' && expression.value) {
		throw new TypeError(
			"schema command where must contain a filter; use 'all' for every row",
		)
	}

	const ast = immutableRecord({
		...createQueryAst(schema),
		where: immutableRecord({ kind: 'where' as const, expression }),
	})

	if (uniquePath !== undefined) {
		// The upsert target validator is the single source of truth for unique targeting.
		normalizeUniqueUpsertTarget(schema, ast, uniquePath)
	}

	return immutableRecord({ ast, schema })
}

/** Normalizes `select` and `include` through the canonical read projection. */
const normalizeProjection = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	select: QuerySelection<TSchema> | undefined,
	include?: FindOneInput<TSchema>['include'],
): SchemaQuery<TSchema>['ast'] =>
	queryFromFindOneInput(schema, {
		...(include === undefined ? {} : { include }),
		...(select === undefined ? {} : { select }),
	}).ast

const normalizeSelection = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	select: QuerySelection<TSchema> | undefined,
): QuerySelectionNode<QueryFieldName<TSchema>> =>
	select === undefined
		? emptyQuerySelection
		: normalizeQuerySelection(schema, select)

const projectQuery = <TSchema extends SchemaDefinition>(
	query: SchemaQuery<TSchema>,
	projection: Pick<SchemaQuery<TSchema>['ast'], 'inclusion' | 'selection'>,
): SchemaQuery<TSchema> =>
	immutableRecord({
		ast: immutableRecord({
			...query.ast,
			inclusion: projection.inclusion,
			selection: projection.selection,
		}),
		schema: query.schema,
	})

/** Retains one nested inclusion shared by every itemized batch result. */
const createBatchProjection = <TSchema extends SchemaDefinition>(
	projection: SchemaQuery<TSchema>['ast'],
): OperationBatchProjection | undefined =>
	projection.inclusion.fields.length === 0
		? undefined
		: immutableRecord({
				// Batch projections erase the schema like every other batch item.
				operation: immutableRecord({
					kind: 'find-many' as const,
					query: projection,
				}) as unknown as FindManyOperationAst<SchemaDefinition>,
			})

const executeBatch = <TOperation extends OperationBatchEntry['operation']>(
	entries: readonly OperationBatchEntry<TOperation>[],
	options: OperationOptions | undefined,
	projection?: OperationBatchProjection,
): Promise<readonly object[]> =>
	executeOperationBatch(
		immutableArray(entries),
		normalizeOperationOptions(options),
		projection,
	) as Promise<readonly object[]>

/**
 * Converts the links of both upsert branches; both are checked, whichever
 * branch runs (ADR-0308).
 */
const normalizeUpsertLinks = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: Pick<SchemaUpsertOneExecutionInput<TSchema>, 'create' | 'update'>,
	path: string,
): Readonly<{
	data: UpsertInput<TSchema>
	links: readonly LinkTargetMarker[]
}> => {
	const create = normalizeCollectionLinks(
		schema,
		input.create,
		`${path}.create`,
	)
	const update = normalizeCollectionLinks(
		schema,
		input.update,
		`${path}.update`,
	)

	return immutableRecord({
		// Update links are stored Pointers too; normalization keeps them as values.
		data: immutableRecord({
			create: create.data,
			update: update.data as UpsertInput<TSchema>['update'],
		}),
		links: immutableArray([...create.links, ...update.links]),
	})
}

/** Creates one row through the schema class rather than a selection QueryBuilder. */
export const createSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object> => {
	assertExactCommandKeys(
		input,
		'schema create input',
		['data'],
		['include', 'select'],
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
		'schema createMany input',
		['data'],
		['include', 'select'],
	)
	assertCommandArray(input.data, 'schema createMany data')

	const projection = normalizeProjection(schema, input.select, input.include)
	const schemaNode = createQueryAst(schema).schema

	return rejectLinkFailures(() => {
		const entries = input.data.map((item, index) => {
			const { data, links } = normalizeCollectionLinks(
				schema,
				item,
				`schema createMany data[${String(index)}]`,
			)
			const operation: CreateOneOperationAst<
				TSchema,
				QueryFieldName<TSchema>
			> = immutableRecord({
				input: data,
				kind: 'create-one',
				schema: schemaNode,
				selection: projection.selection,
			})

			return immutableRecord({
				operation: markLinkTargetOperation(operation, links),
			})
		})

		return executeOperationBatch(
			immutableArray(entries),
			normalizeOperationOptions(options),
			createBatchProjection(projection),
		)
	})
}

/** Updates one exact unique target through the schema class. */
export const updateSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object | null> => {
	const path = 'schema updateOne input'

	assertExactCommandKeys(input, path, ['data', 'where'], ['include', 'select'])
	const query = createSchemaWhereQuery(
		schema,
		input.where,
		'schema updateOne where',
	)

	return executeQueryUpdateOne(
		projectQuery(
			query,
			normalizeProjection(schema, input.select, input.include),
		),
		input.data,
		options,
	)
}

/** Updates independently targeted rows through one atomic batch. */
export const updateSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpdateManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		'schema updateMany input',
		['data'],
		['include', 'select'],
	)
	assertCommandArray(input.data, 'schema updateMany data')

	// Without an explicit projection, batch updates return only identities.
	const projection = normalizeProjection(
		schema,
		input.select ?? { id: true },
		input.include,
	)

	return rejectLinkFailures(() => {
		const entries = input.data.map((item, index) => {
			assertExactCommandKeys(item, `schema updateMany data[${String(index)}]`, [
				'data',
				'where',
			])
			const query = createSchemaWhereQuery(
				schema,
				item.where,
				'schema batch item where',
			)
			const { data, links } = normalizeCollectionLinks(
				schema,
				item.data,
				`schema updateMany data[${String(index)}].data`,
			)
			const operation: UpdateOneOperationAst<
				TSchema,
				UpdateExpression<TSchema>,
				QueryFilterNode<TSchema>,
				QueryFieldName<TSchema>
			> = immutableRecord({
				kind: 'update-one',
				query: immutableRecord({
					...query.ast,
					selection: projection.selection,
				}),
				update: normalizeUpdateExpression(schema, data),
			})

			return immutableRecord({
				operation: markLinkTargetOperation(operation, links),
				requireResult: true as const,
			})
		})

		return executeBatch(entries, options, createBatchProjection(projection))
	})
}

/** Upserts one exact unique target through the schema class. */
export const upsertSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpsertOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object> => {
	assertExactCommandKeys(
		input,
		'schema upsert input',
		['create', 'update', 'where'],
		['select'],
	)
	const query = createSchemaWhereQuery(schema, input.where)

	return rejectLinkFailures(() => {
		const upsert = normalizeUpsertLinks(schema, input, 'schema upsert')

		return executeQueryUpsertOne(
			projectQuery(query, {
				inclusion: query.ast.inclusion,
				selection: normalizeSelection(schema, input.select),
			}),
			upsert.data,
			options,
			upsert.links,
		)
	})
}

/** Upserts independently targeted items through the schema class. */
export const upsertSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaUpsertManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly QueryResult<TSchema, QueryFieldName<TSchema>>[]> => {
	assertExactCommandKeys(input, 'schema upsertMany input', ['data'], ['select'])
	assertCommandArray(input.data, 'schema upsertMany data')

	const selection = normalizeSelection(schema, input.select)

	return rejectLinkFailures(() => {
		const entries = input.data.map((item, index) => {
			const path = `schema upsertMany data[${String(index)}]`

			assertExactCommandKeys(item, path, ['create', 'update', 'where'])

			const query = createSchemaWhereQuery(schema, item.where)
			const upsert = normalizeUpsertLinks(schema, item, path)
			const operation: UpsertOneOperationAst<
				TSchema,
				UpdateExpression<TSchema>,
				QueryFilterNode<TSchema>,
				QueryFieldName<TSchema>
			> = immutableRecord({
				...normalizeUpsertInput(schema, upsert.data),
				kind: 'upsert-one',
				query: immutableRecord({ ...query.ast, selection }),
				target: normalizeUniqueUpsertTarget(schema, query.ast, `${path}.where`),
			})

			return immutableRecord({
				operation: markLinkTargetOperation(operation, upsert.links),
			})
		})

		return executeOperationBatch(
			immutableArray(entries),
			normalizeOperationOptions(options),
		)
	})
}

/** Deletes one exact unique target through the schema class. */
export const deleteSchemaRecord = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object | null> => {
	const path = 'schema deleteOne input'

	assertExactCommandKeys(input, path, ['where'], ['select'])
	const query = createSchemaWhereQuery(
		schema,
		input.where,
		'schema deleteOne where',
	)

	return executeQueryDeleteOne(
		projectQuery(query, {
			inclusion: query.ast.inclusion,
			selection: normalizeSelection(schema, input.select),
		}),
		options,
	)
}

/** Deletes independently targeted rows through one atomic batch. */
export const deleteSchemaRecords = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaDeleteManyExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<readonly object[]> => {
	assertExactCommandKeys(
		input,
		'schema deleteMany input',
		['where'],
		['select'],
	)
	assertCommandArray(input.where, 'schema deleteMany where')

	const entries = input.where.map((where) => {
		// Without an explicit projection, batch deletes return only identities.
		const selection = normalizeQuerySelection(
			schema,
			input.select ?? { id: true },
		)
		const query = createSchemaWhereQuery(
			schema,
			where,
			'schema batch item where',
		)
		const operation: DeleteOneOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			QueryFieldName<TSchema>
		> = immutableRecord({
			kind: 'delete-one',
			query: immutableRecord({ ...query.ast, selection }),
		})

		return immutableRecord({ operation, requireResult: true as const })
	})

	return executeBatch(entries, options)
}

import {
	Schema,
	type GenericField,
	type SchemaDefinition,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryFieldName,
	QueryInclusionNode,
	QueryOrderDirection,
	QueryWhereNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import { normalizeQueryOrdering } from '../clauses/ordering.js'
import type {
	QueryIncludableFieldName,
	QueryInclusionAst,
	QueryInclusionInput,
	QueryInclusionTargetSchema,
	QueryPointerFieldName,
} from '../clauses/inclusion.js'
import { normalizeQueryInclusion } from '../clauses/inclusion.js'
import {
	normalizeQueryCursorPagination,
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from '../clauses/pagination.js'
import {
	emptyQuerySelection,
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
	type ExactQuerySelection,
	type LiteralQuerySelection,
	type QuerySelectedField,
	type QuerySelection,
} from '../clauses/selection.js'
import {
	normalizeLogicalFilter,
	type QueryFilterNode,
} from '../filters/logical.js'
import { createQueryValueFilter } from '../filters/factory.js'
import type { QueryPrimitiveFilterNode } from '../filters/primitive.js'
import type { QueryRelationFilterForSchema } from '../filters/relation.js'
import {
	resolveWhereInput,
	whereInputFromQueryFilter,
	type WhereBuilder,
	type WhereCallback,
	type WhereInput,
	type WhereSource,
} from '../filters/where.js'
import type {
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExistsOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
	OperationAstNode,
	OperationObjectId,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from '../operations/contracts.js'
import {
	executeOperation,
	normalizeBulkOperationOptions,
	normalizeOperationOptions,
	type InferBulkOperationResult,
	type InferBulkOperationAtomicity,
	type QueryRelationPrivateScope,
	type OperationPrivateScope,
} from '../operations/execution.js'
import type {
	BulkOperationOptions,
	OperationOptions,
} from '../operations/options.js'
import type { InferOperationResult } from '../operations/results.js'
import { snapshotCreateInputs } from '../operations/bulk.js'
import {
	normalizeUniqueUpsertTarget,
	normalizeUpsertInput,
	normalizeUpsertItems,
	type UpsertInput,
	type UpsertManyItemInput,
} from '../operations/upsert.js'
import type {
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
} from '../operations/schema-commands.js'
import type {
	UpdateExpression,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import type {
	InferQueryResult,
	QueryPointerResultInclusion,
	QueryRelationResultInclusion,
} from './result.js'
import type { NormalizedQueryInput, QueryBuilderInput } from './input.js'
import type { QueryScope } from './scope.js'

type QueryBuilderInclusion<TSchema extends SchemaDefinition> = [
	QueryIncludableFieldName<TSchema>,
] extends [never]
	? QueryInclusionNode<QueryFieldName<TSchema>>
	: QueryInclusionAst<TSchema>

type QueryBuilderAst<TSchema extends SchemaDefinition> = QueryAst<
	TSchema,
	QueryFilterNode<TSchema>,
	QueryBuilderInclusion<TSchema>
>

type QueryExecutionInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
> =
	| NormalizedQueryInput<TSchema, TSelectedField, TIncludedPointer>
	| QueryBuilder<TSchema, TSelectedField, TIncludedPointer>

// QueryBuilder state stays outside the frozen public shell so internal hydration does
// not need a public constructor overload or an externally callable static API.
const queryAsts = new WeakMap<object, unknown>()
const queryPrivateScopes = new WeakMap<object, OperationPrivateScope>()

const readQueryAst = <const TSchema extends SchemaDefinition>(
	query: object,
): QueryBuilderAst<TSchema> => {
	const ast: unknown = queryAsts.get(query)

	if (ast === undefined) {
		throw new TypeError('QueryBuilder instance has no internal AST')
	}

	// Only this module stores ASTs, always beside the matching QueryBuilder schema type.
	return ast as QueryBuilderAst<TSchema>
}

const storeQueryAst = <const TSchema extends SchemaDefinition>(
	query: object,
	ast: QueryBuilderAst<TSchema>,
): void => {
	queryAsts.set(query, ast)
}

/** Reads a trusted scope that must remain invisible to QueryBuilder hooks and serialization. */
const readQueryPrivateScope = (
	query: object,
): OperationPrivateScope | undefined => queryPrivateScopes.get(query)

/** Retains one immutable framework scope beside, never inside, the public AST. */
const storeQueryPrivateScope = (
	query: object,
	scope: OperationPrivateScope | undefined,
): void => {
	if (scope !== undefined) {
		queryPrivateScopes.set(query, scope)
	}
}

type QueryAstPatch<TSchema extends SchemaDefinition> = Partial<
	Pick<
		QueryBuilderAst<TSchema>,
		'inclusion' | 'limit' | 'ordering' | 'pagination' | 'selection' | 'where'
	>
>

type QuerySelectionAfterInclude<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedField extends QueryIncludableFieldName<TSchema>,
> = TIncludedField extends QueryPointerFieldName<TSchema>
	? [TSelectedField] extends [never]
		? never
		: TSelectedField | TIncludedField
	: TSelectedField

type ReplaceResultInclusion<
	TIncludedPointer,
	TFieldName extends string,
	TNextInclusion,
> = Exclude<TIncludedPointer, { readonly field: TFieldName }> | TNextInclusion

type QueryResultInclusionForField<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TTargetSelectedField extends QueryFieldName<
		QueryInclusionTargetSchema<TSchema, TFieldName>
	>,
	TTargetInclusion,
> = TFieldName extends QueryPointerFieldName<TSchema>
	? QueryPointerResultInclusion<
			TFieldName,
			QueryInclusionTargetSchema<TSchema, TFieldName>,
			TTargetSelectedField,
			TTargetInclusion
		>
	: QueryRelationResultInclusion<
			TFieldName,
			QueryInclusionTargetSchema<TSchema, TFieldName>,
			TTargetSelectedField,
			TTargetInclusion
		>

const getFieldQueryTarget = (
	field: GenericField,
): SchemaDefinition | undefined => {
	if (field.kind !== 'pointer' && field.kind !== 'relation') {
		return undefined
	}

	const target = getFieldSchemaTarget(field)?.()

	return Schema.is(target) ? target : undefined
}

/** Rebuilds the projection subset allowed inside one canonical pointer include. */
const buildQueryProjectionInput = <const TSchema extends SchemaDefinition>(
	ast: QueryBuilderAst<TSchema>,
	kind: 'pointer' | 'relation',
): Readonly<Record<string, unknown>> => {
	const selection: Record<string, true> = {}
	const include: Record<string, Readonly<Record<string, unknown>>> = {}

	for (const field of ast.selection.fields) {
		selection[field.field] = true
	}

	for (const inclusion of ast.inclusion.fields) {
		include[inclusion.field] = buildQueryProjectionInput(
			inclusion.query as QueryBuilderAst<SchemaDefinition>,
			inclusion.kind === 'included-pointer' ? 'pointer' : 'relation',
		)
	}

	return immutableRecord({
		...(ast.where === undefined
			? {}
			: { where: whereInputFromQueryFilter(ast.where.expression) }),
		...(Object.keys(selection).length === 0
			? {}
			: { select: immutableRecord(selection) }),
		...(Object.keys(include).length === 0
			? {}
			: { include: immutableRecord(include) }),
		...(kind === 'relation' && ast.ordering.orders.length > 0
			? {
					orderBy: immutableArray(
						ast.ordering.orders.map((order) =>
							immutableRecord({
								[order.field]:
									order.direction === 'ascending' ? 'asc' : 'desc',
							}),
						),
					),
				}
			: {}),
		...(kind === 'relation' && ast.limit !== undefined
			? { limit: ast.limit }
			: {}),
		...(kind === 'relation' && ast.pagination?.kind === 'offset-pagination'
			? { offset: ast.pagination.offset }
			: {}),
	})
}

/**
 * Builds one immutable, transport-neutral query without retaining execution state.
 *
 * Builder methods return reusable branches and `build()` emits the canonical
 * object input accepted by schema-root reads. The builder performs no I/O and
 * retains no Runtime, request, authority, or transaction state.
 *
 * @example
 * ```ts
 * const published = new QueryBuilder(Post)
 *   .where({ published: { eq: true } })
 *   .select({ id: true, title: true })
 *   .build()
 * ```
 */
export class QueryBuilder<
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedPointer = never,
> {
	// The explicit mode separates `never` (implicit select-all) from every concrete
	// projection, while input and output positions keep selected unions invariant.
	declare private readonly selectedFieldType: {
		readonly mode: [TSelectedField] extends [never] ? 'all' : 'selected'
		readonly read: TSelectedField
		readonly write: (field: TSelectedField) => void
	}
	declare private readonly includedPointerType: {
		readonly read: TIncludedPointer
		readonly write: (inclusion: TIncludedPointer) => void
	}

	constructor(schema: TSchema) {
		storeQueryAst(this, createQueryAst(schema))

		// Public instances cannot acquire mutable ad-hoc state between branches.
		Object.freeze(this)
	}

	/** Exposes the immutable representation consumed by transports and Runtime. */
	get ast(): QueryBuilderAst<TSchema> {
		return readQueryAst<TSchema>(this)
	}

	/** Returns the exact schema retained by the QueryBuilder AST. */
	get schema(): TSchema {
		return this.ast.schema.definition
	}

	/**
	 * Replaces the current flat projection with literal inclusion or exclusion flags.
	 *
	 * Any `true` enables inclusion mode. With only `false` values, every other
	 * schema field remains selected. Nested relation projections belong to `include`.
	 *
	 * @example `new QueryBuilder(Post).select({ id: true, title: true })`
	 * @example `new QueryBuilder(Post).select({ internalNote: false })`
	 */
	select<const TSelection extends QuerySelection<TSchema>>(
		selection: QuerySelection<TSchema> &
			ExactQuerySelection<TSchema, TSelection> &
			LiteralQuerySelection<TSelection>,
	): QueryBuilder<
		TSchema,
		QuerySelectedField<TSchema, TSelection>,
		TIncludedPointer
	> {
		return this.#with<QuerySelectedField<TSchema, TSelection>>({
			selection: normalizeQuerySelection(this.schema, selection),
		})
	}

	/**
	 * Loads one pointer or relation through an exact target QueryBuilder.
	 *
	 * The callback only builds portable AST state. It performs no I/O, and a
	 * repeated field replaces its earlier shape without changing inclusion order.
	 *
	 * @example `new QueryBuilder(Post).include('author', (query) => query.select({ id: true, name: true }))`
	 */
	include<
		const TFieldName extends QueryIncludableFieldName<TSchema>,
		TTargetSelectedField extends QueryFieldName<
			QueryInclusionTargetSchema<TSchema, TFieldName>
		>,
		TTargetIncludedPointer,
	>(
		fieldName: TFieldName,
		shape: (
			query: QueryBuilder<QueryInclusionTargetSchema<TSchema, TFieldName>>,
		) => QueryBuilder<
			QueryInclusionTargetSchema<TSchema, TFieldName>,
			TTargetSelectedField,
			TTargetIncludedPointer
		>,
	): QueryBuilder<
		TSchema,
		QuerySelectionAfterInclude<TSchema, TSelectedField, TFieldName>,
		ReplaceResultInclusion<
			TIncludedPointer,
			TFieldName,
			QueryResultInclusionForField<
				TSchema,
				TFieldName,
				TTargetSelectedField,
				TTargetIncludedPointer
			>
		>
	> {
		const field = this.schema.fields[fieldName]
		const target = field === undefined ? undefined : getFieldQueryTarget(field)

		if (target === undefined) {
			throw new TypeError(
				'query inclusion field must reference a pointer or relation field',
			)
		}

		// The field-level target type and private callback originate from the same
		// relationship factory; runtime identity is rechecked below before storage.
		const exactTarget =
			target as QueryInclusionTargetSchema<TSchema, TFieldName>
		const targetQuery = shape(
			new QueryBuilder<QueryInclusionTargetSchema<TSchema, TFieldName>>(
				exactTarget,
			),
		)

		if (
			!(targetQuery instanceof QueryBuilder) ||
			targetQuery.schema !== target
		) {
			throw new TypeError(
				'query inclusion callback must return a QueryBuilder for the relationship target',
			)
		}

		const inclusions = this.ast.inclusion.fields.map((inclusion) => ({
			field: inclusion.field,
			query: inclusion.query,
		})) as unknown as readonly QueryInclusionInput<TSchema>[]
		const selectionFields = this.ast.selection.fields.map(
			(selection) => selection.field,
		)
		const selection =
			selectionFields.length === 0 || field?.kind === 'relation'
				? this.ast.selection
				: normalizeQuerySelectedFields(this.schema, [
						...selectionFields,
						fieldName,
					])

		return this.#with<
			QuerySelectionAfterInclude<TSchema, TSelectedField, TFieldName>,
			ReplaceResultInclusion<
				TIncludedPointer,
				TFieldName,
				QueryResultInclusionForField<
					TSchema,
					TFieldName,
					TTargetSelectedField,
					TTargetIncludedPointer
				>
			>
		>({
			inclusion: normalizeQueryInclusion(this.schema, [
				...inclusions,
				{ field: fieldName, query: targetQuery.ast } as unknown as QueryInclusionInput<TSchema>,
			]),
			selection,
		})
	}

	/** Appends ascending order terms without mutating earlier query branches. */
	ascending(
		...fields: readonly QueryFieldName<TSchema>[]
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#order('ascending', fields)
	}

	/** Appends descending order terms without mutating earlier query branches. */
	descending(
		...fields: readonly QueryFieldName<TSchema>[]
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#order('descending', fields)
	}

	/** Defines the single page-size clause shared by all pagination strategies. */
	limit(
		value: number,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#with({ limit: normalizeQueryLimit(value) })
	}

	/** Selects offset pagination and rejects an existing cursor position. */
	offset(value: number): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		const pagination = normalizeQueryOffsetPagination({ offset: value })

		if (pagination === undefined) {
			// Zero removes an existing offset while leaving an unrelated cursor branch intact.
			return this.ast.pagination?.kind === 'offset-pagination'
				? this.#with({ pagination: undefined })
				: this.#with({})
		}

		if (this.ast.pagination?.kind === 'cursor-pagination') {
			throw new TypeError('query cannot combine offset and after pagination')
		}

		return this.#with({ pagination })
	}

	/** Selects the first or a resumed cursor page and rejects an existing offset. */
	after(
		cursor?: string,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		if (this.ast.pagination?.kind === 'offset-pagination') {
			throw new TypeError('query cannot combine offset and after pagination')
		}

		return this.#with({
			pagination: normalizeQueryCursorPagination(
				cursor === undefined ? {} : { after: cursor },
			),
		})
	}

	/**
	 * Adds one schema-correlated object or builder filter through implicit AND.
	 *
	 * The object form is the canonical public contract shared with mutations and
	 * future transports. A callback receives the same immutable utility builder.
	 *
	 * @example `new QueryBuilder(Post).where({ published: { eq: true }, views: { gte: 10 } })`
	 * @example `new QueryBuilder(Post).where((where) => where.eq('published', true))`
	 */
	/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve field completions for the canonical object form. */
	where(
		input: WhereInput<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer>
	where(
		builder: WhereBuilder<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer>
	where(
		callback: WhereCallback<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer>
	where(
		input: WhereSource<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(resolveWhereInput(this.schema, input))
	}
	/* eslint-enable @typescript-eslint/unified-signatures */

	/** Applies one reusable transformation without exposing execution state. */
	use(
		scope: QueryScope<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		const scopedQuery = scope(this)

		if (!(scopedQuery instanceof QueryBuilder)) {
			throw new TypeError('query scope must return a QueryBuilder instance')
		}

		if (scopedQuery.schema !== this.schema) {
			throw new TypeError('query scope must return the same schema definition')
		}

		// A developer scope may replace the public AST branch, but it cannot replace
		// or discard a framework-owned pointer or relation restriction.
		return hydrateQueryFromAst(scopedQuery.ast, readQueryPrivateScope(this))
	}

	/** Returns the canonical object input accepted by schema-root collection reads. */
	build(): QueryBuilderInput<TSchema, TSelectedField, TIncludedPointer> {
		const selection: Record<string, true> = {}
		const include: Record<string, Readonly<Record<string, unknown>>> = {}

		for (const field of this.ast.selection.fields) {
			selection[field.field] = true
		}

		for (const inclusion of this.ast.inclusion.fields) {
			include[inclusion.field] = buildQueryProjectionInput(
				inclusion.query as QueryBuilderAst<SchemaDefinition>,
				inclusion.kind === 'included-pointer' ? 'pointer' : 'relation',
			)
		}

		const input = immutableRecord({
			...(this.ast.where === undefined
				? {}
				: { where: whereInputFromQueryFilter(this.ast.where.expression) }),
			...(Object.keys(selection).length === 0
				? {}
				: { select: immutableRecord(selection) }),
			...(Object.keys(include).length === 0
				? {}
				: { include: immutableRecord(include) }),
			...(this.ast.ordering.orders.length === 0
				? {}
				: {
						orderBy: immutableArray(
							this.ast.ordering.orders.map((order) =>
								immutableRecord({
									[order.field]:
										order.direction === 'ascending' ? 'asc' : 'desc',
								}),
							),
						),
					}),
			...(this.ast.limit === undefined ? {} : { limit: this.ast.limit }),
			...(this.ast.pagination?.kind === 'offset-pagination'
				? { offset: this.ast.pagination.offset }
				: {}),
			...(this.ast.pagination?.kind === 'cursor-pagination'
				? { cursor: this.ast.pagination.after ?? true }
				: {}),
		})

		return input as unknown as QueryBuilderInput<
			TSchema,
			TSelectedField,
			TIncludedPointer
		>
	}

	#order(
		direction: QueryOrderDirection,
		fields: readonly QueryFieldName<TSchema>[],
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		const orders = this.ast.ordering.orders.map((order) => ({
			field: order.field,
			direction: order.direction,
		}))

		return this.#with({
			ordering: normalizeQueryOrdering(this.schema, [
				...orders,
				...fields.map((field) => ({ field, direction })),
			]),
		})
	}

	#appendFilter(
		filter: QueryFilterNode<TSchema>,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		const currentExpression = this.ast.where?.expression
		const expression =
			currentExpression === undefined
				? filter
				: normalizeLogicalFilter<
						| QueryPrimitiveFilterNode<TSchema>
						| QueryRelationFilterForSchema<TSchema>
					>({
						kind: 'and',
						expressions: [currentExpression, filter],
					})
		const where: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
			kind: 'where',
			expression,
		})

		return this.#with({ where })
	}

	#with<
		TNextSelection extends QueryFieldName<TSchema> = TSelectedField,
		TNextIncludedPointer = TIncludedPointer,
	>(
		patch: QueryAstPatch<TSchema>,
	): QueryBuilder<TSchema, TNextSelection, TNextIncludedPointer> {
		return hydrateQueryFromAst<TSchema, TNextSelection, TNextIncludedPointer>(
			immutableRecord({ ...this.ast, ...patch }),
			readQueryPrivateScope(this),
		)
	}
}

/**
 * Restores a frozen unbound QueryBuilder from one already normalized immutable AST.
 *
 * This module-level export is intentionally omitted from Core's public export
 * surface. Runtime uses it to expose `beforeRead` without adding execution state
 * or a low-level AST constructor to the developer-facing QueryBuilder API.
 *
 * @internal
 */
export const hydrateQueryFromAst = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer = never,
>(
	ast: QueryBuilderAst<TSchema>,
	privateScope?: OperationPrivateScope,
): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> => {
	const query = new QueryBuilder<TSchema, TSelectedField, TIncludedPointer>(
		ast.schema.definition,
	)

	storeQueryAst(query, ast)
	storeQueryPrivateScope(query, privateScope)

	return query
}

/**
 * Applies a framework-owned object identity without exposing it to QueryBuilder hooks.
 *
 * @internal Pointer and relation handles are the only intended callers.
 */
export const scopeQueryToObjectId = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	id: OperationObjectId<TSchema>,
	options: Readonly<{ readonly nativeAccessDeniedAsMissing?: true }> = {},
): NormalizedQueryInput<TSchema, TSelectedField, TIncludedPointer> => {
	const rowFilter = createQueryValueFilter(query.schema, 'equal', 'id', id)
	const scope: OperationPrivateScope = immutableRecord({
		kind: 'row-filter',
		...(options.nativeAccessDeniedAsMissing === undefined
			? {}
			: { nativeAccessDeniedAsMissing: true as const }),
		objectId: String(id),
		rowFilter,
	})

	const scoped = immutableRecord({ ast: query.ast, schema: query.schema })

	storeQueryPrivateScope(scoped, scope)

	return scoped
}

/** Describes one trusted relation restriction before it enters private QueryBuilder state. */
export interface QueryRelationScopeInput<
	TSource extends SchemaDefinition = SchemaDefinition,
	TTarget extends SchemaDefinition = SchemaDefinition,
> {
	readonly fieldName: string
	readonly source: TSource
	readonly sourceObjectId: string
	readonly target: TTarget
}

/**
 * Applies one framework-owned relation edge without adding it to the public AST.
 *
 * @internal Persisted Relation handles are the only intended caller.
 */
export const scopeQueryToRelation = <
	const TSource extends SchemaDefinition,
	const TTarget extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TTarget>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TTarget, TSelectedField, TIncludedPointer>,
	input: QueryRelationScopeInput<TSource, TTarget>,
): NormalizedQueryInput<TTarget, TSelectedField, TIncludedPointer> => {
	if (query.schema !== input.target) {
		throw new TypeError('relation query must use its exact target schema')
	}

	const scope: QueryRelationPrivateScope = immutableRecord({
		fieldPath: immutableArray([input.fieldName]),
		kind: 'relation',
		source: input.source,
		sourceObjectId: input.sourceObjectId,
		target: input.target,
	})

	const scoped = immutableRecord({ ast: query.ast, schema: query.schema })

	storeQueryPrivateScope(scoped, scope)

	return scoped
}

/**
 * Executes an internal operation with the protected scope retained by a QueryBuilder.
 *
 * @internal Relation mutations use this bridge so their source identity never
 * enters the transformable operation AST.
 */
export const executeQueryWithPrivateScope = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
	const TOperation extends OperationAstNode,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	operation: TOperation,
	options?: OperationOptions,
): Promise<InferOperationResult<TOperation>> =>
	executeOperation(
		operation,
		normalizeOperationOptions(options),
		readQueryPrivateScope(query),
	)

/** Executes one collection read while retaining framework-owned private scope. */
export const executeQueryFindMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<
	readonly InferQueryResult<TSchema, TSelectedField, TIncludedPointer>[]
> => {
	const operation: FindManyOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'find-many', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one first-match read while retaining framework-owned private scope. */
export const executeQueryFindOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<InferQueryResult<
	TSchema,
	TSelectedField,
	TIncludedPointer
> | null> => {
	const operation: FindOneOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'find-one', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one exact identifier read while retaining private QueryBuilder filters. */
export const executeQueryGet = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	id: OperationObjectId<TSchema>,
	options?: OperationOptions,
): Promise<InferQueryResult<
	TSchema,
	TSelectedField,
	TIncludedPointer
> | null> => {
	const operation: GetOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'get', id, query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one filtered count without materializing model values. */
export const executeQueryCount = <const TSchema extends SchemaDefinition>(
	query: QueryExecutionInput<TSchema, never, never>,
	options?: OperationOptions,
): Promise<number> => {
	const operation: CountOperationAst<
		TSchema,
		QueryFilterNode<TSchema>
	> = immutableRecord({ kind: 'count', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one filtered existence check without loading model values. */
export const executeQueryExists = <const TSchema extends SchemaDefinition>(
	query: QueryExecutionInput<TSchema, never, never>,
	options?: OperationOptions,
): Promise<boolean> => {
	const operation: ExistsOperationAst<
		TSchema,
		QueryFilterNode<TSchema>
	> = immutableRecord({ kind: 'exists', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one schema-owned create command without inventing a meaningless QueryBuilder. */
export const executeSchemaCreateOne = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object> => {
	const operation: CreateOneOperationAst<
		TSchema,
		QueryFieldName<TSchema>
	> = immutableRecord({
		kind: 'create-one',
		schema: createQueryAst(schema).schema,
		input: input.data,
		selection:
			input.select === undefined
				? emptyQuerySelection
				: normalizeQuerySelection(schema, input.select),
	})

	return executeOperation(operation, normalizeOperationOptions(options))
}

/** Executes one ordered schema-owned bulk create command. */
export const executeSchemaCreateMany = <
	const TSchema extends SchemaDefinition,
	const TOptions extends BulkOperationOptions | undefined = undefined,
>(
	schema: TSchema,
	input: SchemaCreateManyExecutionInput<TSchema>,
	options?: TOptions & BulkOperationOptions,
): Promise<
	InferBulkOperationResult<
		InferQueryResult<TSchema, QueryFieldName<TSchema>>,
		TOptions
	>
> => {
	const normalizedOptions = normalizeBulkOperationOptions<TOptions>(options)
	const operation: CreateManyOperationAst<
		TSchema,
		InferBulkOperationAtomicity<TOptions>,
		QueryFieldName<TSchema>
	> = immutableRecord({
		kind: 'create-many',
		schema: createQueryAst(schema).schema,
		inputs: snapshotCreateInputs(input.data),
		options: normalizedOptions.bulk,
		selection:
			input.select === undefined
				? emptyQuerySelection
				: normalizeQuerySelection(schema, input.select),
	})

	// The operation already fixes every selected field. This annotation only
	// collapses the generic empty-schema branch retained by the conditional mapper.
	return executeOperation(operation, normalizedOptions) as Promise<
		InferBulkOperationResult<
			InferQueryResult<TSchema, QueryFieldName<TSchema>>,
			TOptions
		>
	>
}

/** Executes one singular update while retaining private QueryBuilder restrictions. */
export const executeQueryUpdateOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryBuilder<TSchema, TSelectedField, TIncludedPointer>,
	input: UpdateExpressionInput<TSchema> & {},
	options?: OperationOptions,
): Promise<InferQueryResult<
	TSchema,
	TSelectedField,
	TIncludedPointer
> | null> => {
	const operation: UpdateOneOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({
		kind: 'update-one',
		query: query.ast,
		update: normalizeUpdateExpression(query.schema, input),
	})

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one set-based update while retaining private QueryBuilder restrictions. */
export const executeQueryUpdateMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
>(
	query: QueryBuilder<TSchema, TSelectedField>,
	input: UpdateExpressionInput<TSchema> & {},
	options?: OperationOptions,
): Promise<readonly InferQueryResult<TSchema, TSelectedField>[]> => {
	const operation: UpdateManyOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField
	> = immutableRecord({
		kind: 'update-many',
		query: query.ast,
		update: normalizeUpdateExpression(query.schema, input),
	})

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one unique-target upsert while retaining private QueryBuilder restrictions. */
export const executeQueryUpsertOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryBuilder<TSchema, TSelectedField, TIncludedPointer>,
	input: UpsertInput<TSchema> & {},
	options?: OperationOptions,
): Promise<InferQueryResult<TSchema, TSelectedField, TIncludedPointer>> => {
	const normalizedInput = normalizeUpsertInput(query.schema, input)
	const operation: UpsertOneOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({
		kind: 'upsert-one',
		query: query.ast,
		target: normalizeUniqueUpsertTarget(query.schema, query.ast),
		...normalizedInput,
	})

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes independently targeted upsert items without a container QueryBuilder. */
export const executeSchemaUpsertMany = <
	const TSchema extends SchemaDefinition,
	const TOptions extends BulkOperationOptions | undefined = undefined,
>(
	schema: TSchema,
	inputs: readonly UpsertManyItemInput<TSchema>[],
	selection: QuerySelection<TSchema> | undefined,
	options?: TOptions & BulkOperationOptions,
): Promise<
	InferBulkOperationResult<
		InferQueryResult<TSchema, QueryFieldName<TSchema>>,
		TOptions
	>
> => {
	const normalizedOptions = normalizeBulkOperationOptions<TOptions>(options)
	const operation: UpsertManyOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		InferBulkOperationAtomicity<TOptions>,
		QueryFieldName<TSchema>
	> = immutableRecord({
		kind: 'upsert-many',
		schema: createQueryAst(schema).schema,
		items: normalizeUpsertItems(schema, inputs),
		options: normalizedOptions.bulk,
		selection:
			selection === undefined
				? emptyQuerySelection
				: normalizeQuerySelection(schema, selection),
	})

	// The operation already fixes every selected field. This annotation only
	// collapses the generic empty-schema branch retained by the conditional mapper.
	return executeOperation(operation, normalizedOptions) as Promise<
		InferBulkOperationResult<
			InferQueryResult<TSchema, QueryFieldName<TSchema>>,
			TOptions
		>
	>
}

/** Executes one singular delete while retaining private QueryBuilder restrictions. */
export const executeQueryDeleteOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryBuilder<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<InferQueryResult<
	TSchema,
	TSelectedField,
	TIncludedPointer
> | null> => {
	const operation: DeleteOneOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'delete-one', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one set-based delete while retaining private QueryBuilder restrictions. */
export const executeQueryDeleteMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
>(
	query: QueryBuilder<TSchema, TSelectedField>,
	options?: OperationOptions,
): Promise<readonly InferQueryResult<TSchema, TSelectedField>[]> => {
	const operation: DeleteManyOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField
	> = immutableRecord({ kind: 'delete-many', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

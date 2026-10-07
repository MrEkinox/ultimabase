import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

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
} from '../clauses/inclusion.js'
import {
	normalizeQueryInclusion,
	resolveQueryInclusionTarget,
} from '../clauses/inclusion.js'
import {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from '../clauses/pagination.js'
import {
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
	type ExactQuerySelection,
	type LiteralQuerySelection,
	type QuerySelectedField,
	type QuerySelection,
} from '../clauses/selection.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { combineWhereExpressions } from '../filters/where-normalize.js'
import {
	resolveWhereInput,
	whereInputFromQueryFilter,
	type WhereBuilder,
	type WhereCallback,
	type WhereInput,
	type WhereSource,
} from '../filters/where.js'
import type { OperationPrivateScope } from '../operations/execution.js'
import type { QueryBuilderInput } from './input.js'
import {
	readQueryPrivateScope,
	storeQueryPrivateScope,
} from './private-scope.js'
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

let hydrate: <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	ast: QueryBuilderAst<TSchema>,
) => QueryBuilder<TSchema, TSelectedField, TIncludedPointer>

type QueryAstPatch<TSchema extends SchemaDefinition> = Partial<
	Pick<
		QueryBuilderAst<TSchema>,
		'inclusion' | 'limit' | 'ordering' | 'pagination' | 'selection' | 'where'
	>
>

import type {
	QueryInclusionTargetBuilder,
	QueryInclusionTargetResult,
	QueryResultInclusionForField,
	QuerySelectionAfterInclude,
	ReplaceResultInclusion,
} from './query-contracts.js'
export type { QueryPointerTargetBuilder } from './query-contracts.js'

/** Serializes normalized AST priorities through deterministic property order. */
const buildQueryOrderByInput = (
	orders: readonly Readonly<{
		readonly direction: QueryOrderDirection
		readonly field: string
	}>[],
): Readonly<Record<string, 'asc' | 'desc'>> =>
	immutableRecord(
		Object.fromEntries(
			orders.map((order) => [
				order.field,
				order.direction === 'ascending' ? 'asc' : 'desc',
			]),
		),
	)

/** Rebuilds the projection subset allowed inside one canonical pointer include. */
const buildQueryInput = <const TSchema extends SchemaDefinition>(
	ast: QueryBuilderAst<TSchema>,
	kind: 'collection' | 'pointer',
): Readonly<Record<string, unknown>> => {
	const selection: Record<string, true> = {}
	const include: Record<string, Readonly<Record<string, unknown>>> = {}

	for (const field of ast.selection.fields) {
		selection[field.field] = true
	}

	for (const inclusion of ast.inclusion.fields) {
		include[inclusion.field] = buildQueryInput(
			inclusion.query as QueryBuilderAst<SchemaDefinition>,
			inclusion.kind === 'included-pointer' ? 'pointer' : 'collection',
		)
	}

	return immutableRecord({
		...(kind === 'pointer' || ast.where === undefined
			? {}
			: { where: whereInputFromQueryFilter(ast.where.expression) }),
		...(Object.keys(selection).length === 0
			? {}
			: { select: immutableRecord(selection) }),
		...(Object.keys(include).length === 0
			? {}
			: { include: immutableRecord(include) }),
		...(kind === 'collection' && ast.ordering.orders.length > 0
			? { orderBy: buildQueryOrderByInput(ast.ordering.orders) }
			: {}),
		...(kind === 'collection' && ast.limit !== undefined
			? { limit: ast.limit }
			: {}),
		...(kind === 'collection' && ast.pagination?.kind === 'offset-pagination'
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

	// Assigned only while hydrating a new frozen branch; never after it escapes.
	#ast: QueryBuilderAst<TSchema>

	static {
		hydrate = <
			const TAstSchema extends SchemaDefinition,
			TAstSelectedField extends QueryFieldName<TAstSchema>,
			TAstIncludedPointer,
		>(
			ast: QueryBuilderAst<TAstSchema>,
		) => {
			const query = new QueryBuilder<
				TAstSchema,
				TAstSelectedField,
				TAstIncludedPointer
			>(ast.schema.definition)

			query.#ast = ast
			return query
		}
	}

	constructor(schema: TSchema) {
		this.#ast = createQueryAst(schema)

		// Public instances cannot acquire mutable ad-hoc state between branches.
		Object.freeze(this)
	}

	/** Exposes the immutable representation consumed by transports and Runtime. */
	get ast(): QueryBuilderAst<TSchema> {
		return this.#ast
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
			query: QueryInclusionTargetBuilder<TSchema, TFieldName>,
		) => QueryInclusionTargetResult<
			TSchema,
			TFieldName,
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
		const { field, target } = resolveQueryInclusionTarget(
			this.schema,
			fieldName,
		)

		// The field-level target type and private callback originate from the same
		// relationship factory; runtime identity is rechecked below before storage.
		const exactTarget = target as QueryInclusionTargetSchema<
			TSchema,
			TFieldName
		>
		const shapedTarget = shape(
			new QueryBuilder<QueryInclusionTargetSchema<TSchema, TFieldName>>(
				exactTarget,
			) as unknown as QueryInclusionTargetBuilder<TSchema, TFieldName>,
		)
		const untrustedTarget: unknown = shapedTarget

		if (
			!(untrustedTarget instanceof QueryBuilder) ||
			untrustedTarget.schema !== target
		) {
			throw new TypeError(
				'query inclusion callback must return a QueryBuilder for the relationship target',
			)
		}
		const targetQuery = untrustedTarget as QueryBuilder<
			QueryInclusionTargetSchema<TSchema, TFieldName>,
			TTargetSelectedField,
			TTargetIncludedPointer
		>

		if (field.kind === 'pointer' && targetQuery.ast.where !== undefined) {
			throw new TypeError(
				'pointer-target input contains an unknown clause: where',
			)
		}

		const inclusions = this.ast.inclusion
			.fields as unknown as readonly QueryInclusionInput<TSchema>[]
		const selectionFields = this.ast.selection.fields.map(
			(selection) => selection.field,
		)
		const selection =
			selectionFields.length === 0 || field.kind === 'relation'
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
				{
					field: fieldName,
					query: targetQuery.ast,
				} as unknown as QueryInclusionInput<TSchema>,
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

	/** Defines an optional maximum result count for the query. */
	limit(
		value: number,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#with({ limit: normalizeQueryLimit(value) })
	}

	/** Selects offset pagination without mutating earlier query branches. */
	offset(
		value: number,
	): QueryBuilder<TSchema, TSelectedField, TIncludedPointer> {
		return this.#with({
			pagination: normalizeQueryOffsetPagination({ offset: value }),
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
		return buildQueryInput(
			this.ast,
			'collection',
		) as unknown as QueryBuilderInput<TSchema, TSelectedField, TIncludedPointer>
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
		const where: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
			kind: 'where',
			expression: combineWhereExpressions(this.ast.where?.expression, filter),
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
 * surface. Runtime and schema commands use it to retain private execution state
 * without exposing a low-level AST constructor on the developer QueryBuilder.
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
	const query = hydrate<TSchema, TSelectedField, TIncludedPointer>(ast)

	storeQueryPrivateScope(query, privateScope)

	return query
}

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
	QueryPointerFieldName,
	QueryPointerInclusionAst,
	QueryPointerInclusionInput,
	QueryPointerTargetSchema,
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
import type { QueryRelationPredicateForSchema } from '../filters/relation.js'
import {
	resolveWhereInput,
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
	ExecutableOperationAst,
	ExistsOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	OperationAstNode,
	OperationObjectId,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from '../operations/contracts.js'
import {
	executeQueryTerminal,
	normalizeQueryBulkTerminalOptions,
	normalizeQueryTerminalOptions,
	type QueryBulkTerminalOptions,
	type QueryBulkTerminalResult,
	type QueryBulkAtomic,
	type QueryRelationPrivateScope,
	type QueryTerminalPrivateScope,
	type QueryTerminalOptions,
} from '../operations/execution.js'
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
import type { InferQueryResult, QueryPointerResultInclusion } from './result.js'
import type { QueryScope } from './scope.js'

type QueryBuilderInclusion<TSchema extends SchemaDefinition> = [
	QueryPointerFieldName<TSchema>,
] extends [never]
	? QueryInclusionNode<QueryFieldName<TSchema>>
	: QueryPointerInclusionAst<TSchema>

type QueryBuilderAst<TSchema extends SchemaDefinition> = QueryAst<
	TSchema,
	QueryFilterNode<TSchema>,
	QueryBuilderInclusion<TSchema>
>

// Query state stays outside the frozen public shell so internal hydration does
// not need a public constructor overload or an externally callable static API.
const queryAsts = new WeakMap<object, unknown>()
const queryPrivateScopes = new WeakMap<object, QueryTerminalPrivateScope>()

const readQueryAst = <const TSchema extends SchemaDefinition>(
	query: object,
): QueryBuilderAst<TSchema> => {
	const ast: unknown = queryAsts.get(query)

	if (ast === undefined) {
		throw new TypeError('Query instance has no internal AST')
	}

	// Only this module stores ASTs, always beside the matching Query schema type.
	return ast as QueryBuilderAst<TSchema>
}

const storeQueryAst = <const TSchema extends SchemaDefinition>(
	query: object,
	ast: QueryBuilderAst<TSchema>,
): void => {
	queryAsts.set(query, ast)
}

/** Reads a trusted scope that must remain invisible to Query hooks and serialization. */
const readQueryPrivateScope = (
	query: object,
): QueryTerminalPrivateScope | undefined => queryPrivateScopes.get(query)

/** Retains one immutable framework scope beside, never inside, the public AST. */
const storeQueryPrivateScope = (
	query: object,
	scope: QueryTerminalPrivateScope | undefined,
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
	TIncludedField extends QueryFieldName<TSchema>,
> = [TSelectedField] extends [never] ? never : TSelectedField | TIncludedField

type ReplacePointerResultInclusion<
	TIncludedPointer,
	TFieldName extends string,
	TNextInclusion,
> = Exclude<TIncludedPointer, { readonly field: TFieldName }> | TNextInclusion

const getFieldQueryTarget = (
	field: GenericField,
): SchemaDefinition | undefined => {
	if (field.kind !== 'pointer') {
		return undefined
	}

	const target = getFieldSchemaTarget(field)?.()

	return Schema.is(target) ? target : undefined
}

/**
 * Builds one immutable, transport-neutral query without retaining execution state.
 *
 * Builder methods return reusable branches. Terminal methods use the exact active
 * request or hook transaction. Trusted backend terminals may instead select one
 * plugin-derived `context`, request audited `useMasterKey`, or pass `ultimabase`
 * to create an anonymous root request. None of those options enters the AST.
 *
 * @example
 * ```ts
 * const published = await Post.query()
 *   .where({ published: { eq: true } })
 *   .find({ ultimabase })
 * ```
 */
export class Query<
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

	/** Returns the exact schema retained by the Query AST. */
	get schema(): TSchema {
		return this.ast.schema.definition
	}

	/**
	 * Replaces the current flat projection with literal inclusion or exclusion flags.
	 *
	 * Any `true` enables inclusion mode. With only `false` values, every other
	 * schema field remains selected. Nested relation projections belong to `include`.
	 *
	 * @example `Post.query().select({ id: true, title: true })`
	 * @example `Post.query().select({ internalNote: false })`
	 */
	select<const TSelection extends QuerySelection<TSchema>>(
		selection: QuerySelection<TSchema> &
			ExactQuerySelection<TSchema, TSelection> &
			LiteralQuerySelection<TSelection>,
	): Query<TSchema, QuerySelectedField<TSchema, TSelection>, TIncludedPointer> {
		return this.#with<QuerySelectedField<TSchema, TSelection>>({
			selection: normalizeQuerySelection(this.schema, selection),
		})
	}

	/**
	 * Loads one pointer through an exact, independently shaped target Query.
	 *
	 * The callback only builds portable AST state. It performs no I/O, and a
	 * repeated field replaces its earlier shape without changing inclusion order.
	 *
	 * @example `Post.query().include('author', (query) => query.select({ id: true, name: true }))`
	 */
	include<
		const TFieldName extends QueryPointerFieldName<TSchema>,
		TTargetSelectedField extends QueryFieldName<
			QueryPointerTargetSchema<TSchema, TFieldName>
		>,
		TTargetIncludedPointer,
	>(
		fieldName: TFieldName,
		shape: (
			query: Query<QueryPointerTargetSchema<TSchema, TFieldName>>,
		) => Query<
			QueryPointerTargetSchema<TSchema, TFieldName>,
			TTargetSelectedField,
			TTargetIncludedPointer
		>,
	): Query<
		TSchema,
		QuerySelectionAfterInclude<TSchema, TSelectedField, TFieldName>,
		ReplacePointerResultInclusion<
			TIncludedPointer,
			TFieldName,
			QueryPointerResultInclusion<
				TFieldName,
				QueryPointerTargetSchema<TSchema, TFieldName>,
				TTargetSelectedField,
				TTargetIncludedPointer
			>
		>
	> {
		const field = this.schema.fields[fieldName]
		const target = field === undefined ? undefined : getFieldQueryTarget(field)

		if (target === undefined) {
			throw new TypeError(
				'query inclusion field must reference a pointer field',
			)
		}

		// The field-level target type and private target callback originate from the
		// same pointer factory; runtime identity is rechecked below before storage.
		const exactTarget = target as QueryPointerTargetSchema<TSchema, TFieldName>
		const targetQuery = shape(
			new Query<QueryPointerTargetSchema<TSchema, TFieldName>>(exactTarget),
		)

		if (!(targetQuery instanceof Query) || targetQuery.schema !== target) {
			throw new TypeError(
				'query inclusion callback must return a Query for the pointer target',
			)
		}

		// Every retained node previously crossed the same pointer-only normalizer.
		const pointers = this.ast.inclusion.pointers.map((pointer) => ({
			field: pointer.field,
			query: pointer.query,
		})) as readonly QueryPointerInclusionInput<TSchema>[]
		const selectionFields = this.ast.selection.fields.map(
			(selection) => selection.field,
		)
		const selection =
			selectionFields.length === 0
				? this.ast.selection
				: normalizeQuerySelectedFields(this.schema, [
						...selectionFields,
						fieldName,
					])

		return this.#with<
			QuerySelectionAfterInclude<TSchema, TSelectedField, TFieldName>,
			ReplacePointerResultInclusion<
				TIncludedPointer,
				TFieldName,
				QueryPointerResultInclusion<
					TFieldName,
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetSelectedField,
					TTargetIncludedPointer
				>
			>
		>({
			inclusion: normalizeQueryInclusion(this.schema, [
				...pointers,
				{ field: fieldName, query: targetQuery.ast },
			]),
			selection,
		})
	}

	/** Appends ascending order terms without mutating earlier query branches. */
	ascending(
		...fields: readonly QueryFieldName<TSchema>[]
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#order('ascending', fields)
	}

	/** Appends descending order terms without mutating earlier query branches. */
	descending(
		...fields: readonly QueryFieldName<TSchema>[]
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#order('descending', fields)
	}

	/** Defines the single page-size clause shared by all pagination strategies. */
	limit(value: number): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#with({ limit: normalizeQueryLimit(value) })
	}

	/** Selects offset pagination and rejects an existing cursor position. */
	skip(value: number): Query<TSchema, TSelectedField, TIncludedPointer> {
		const pagination = normalizeQueryOffsetPagination({ skip: value })

		if (pagination === undefined) {
			// Zero removes an existing offset while leaving an unrelated cursor branch intact.
			return this.ast.pagination?.kind === 'offset-pagination'
				? this.#with({ pagination: undefined })
				: this.#with({})
		}

		if (this.ast.pagination?.kind === 'cursor-pagination') {
			throw new TypeError('query cannot combine skip and after pagination')
		}

		return this.#with({ pagination })
	}

	/** Selects the first or a resumed cursor page and rejects an existing offset. */
	after(cursor?: string): Query<TSchema, TSelectedField, TIncludedPointer> {
		if (this.ast.pagination?.kind === 'offset-pagination') {
			throw new TypeError('query cannot combine skip and after pagination')
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
	 * @example `Post.query().where({ published: { eq: true }, views: { gte: 10 } })`
	 * @example `Post.query().where((where) => where.eq('published', true))`
	 */
	/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve field completions for the canonical object form. */
	where(
		input: WhereInput<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer>
	where(
		builder: WhereBuilder<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer>
	where(
		callback: WhereCallback<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer>
	where(
		input: WhereSource<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(resolveWhereInput(this.schema, input))
	}
	/* eslint-enable @typescript-eslint/unified-signatures */

	/** Applies one reusable transformation without exposing execution state. */
	use(
		scope: QueryScope<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		const scopedQuery = scope(this)

		if (!(scopedQuery instanceof Query)) {
			throw new TypeError('query scope must return a Query instance')
		}

		if (scopedQuery.schema !== this.schema) {
			throw new TypeError('query scope must return the same schema definition')
		}

		// A developer scope may replace the public AST branch, but it cannot replace
		// or discard a framework-owned pointer or relation restriction.
		return hydrateQueryFromAst(scopedQuery.ast, readQueryPrivateScope(this))
	}

	/**
	 * Reads every matching object through the active request or an explicit app.
	 * Hook calls reuse the exact request transaction and execution safeguards.
	 *
	 * @example `await Post.query().find({ ultimabase })`
	 */
	find(
		options?: QueryTerminalOptions,
	): Promise<
		readonly InferQueryResult<TSchema, TSelectedField, TIncludedPointer>[]
	> {
		const operation: FindOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({ kind: 'find', query: this.ast })

		return this.#execute(operation, options)
	}

	/** Reads the first matching object, or `null` when no object matches. */
	first(
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		const operation: FirstOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({ kind: 'first', query: this.ast })

		return this.#execute(operation, options)
	}

	/** Reads one identifier while retaining this query's filters and selection. */
	get(
		id: OperationObjectId<TSchema>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		const operation: GetOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({ kind: 'get', query: this.ast, id })

		return this.#execute(operation, options)
	}

	/** Counts matches without loading persisted object values. */
	count(options?: QueryTerminalOptions): Promise<number> {
		const operation: CountOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'count', query: this.ast })

		return this.#execute(operation, options)
	}

	/** Tests whether at least one object matches this query. */
	exists(options?: QueryTerminalOptions): Promise<boolean>

	exists(options?: QueryTerminalOptions): Promise<boolean> {
		const operation: ExistsOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'exists', query: this.ast })

		return this.#execute(operation, options)
	}

	#order(
		direction: QueryOrderDirection,
		fields: readonly QueryFieldName<TSchema>[],
	): Query<TSchema, TSelectedField, TIncludedPointer> {
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
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		const currentExpression = this.ast.where?.expression
		const expression =
			currentExpression === undefined
				? filter
				: normalizeLogicalFilter<
						| QueryPrimitiveFilterNode<TSchema>
						| QueryRelationPredicateForSchema<TSchema>
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

	#execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
		options: QueryTerminalOptions | undefined,
	): Promise<InferOperationResult<TOperation>> {
		return executeQueryTerminal(
			operation,
			normalizeQueryTerminalOptions(options),
			readQueryPrivateScope(this),
		)
	}

	#with<
		TNextSelection extends QueryFieldName<TSchema> = TSelectedField,
		TNextIncludedPointer = TIncludedPointer,
	>(
		patch: QueryAstPatch<TSchema>,
	): Query<TSchema, TNextSelection, TNextIncludedPointer> {
		return hydrateQueryFromAst<TSchema, TNextSelection, TNextIncludedPointer>(
			immutableRecord({ ...this.ast, ...patch }),
			readQueryPrivateScope(this),
		)
	}
}

/**
 * Restores a frozen unbound Query from one already normalized immutable AST.
 *
 * This module-level export is intentionally omitted from Core's public export
 * surface. Runtime uses it to expose `beforeRead` without adding execution state
 * or a low-level AST constructor to the developer-facing Query API.
 *
 * @internal
 */
export const hydrateQueryFromAst = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer = never,
>(
	ast: QueryBuilderAst<TSchema>,
	privateScope?: QueryTerminalPrivateScope,
): Query<TSchema, TSelectedField, TIncludedPointer> => {
	const query = new Query<TSchema, TSelectedField, TIncludedPointer>(
		ast.schema.definition,
	)

	storeQueryAst(query, ast)
	storeQueryPrivateScope(query, privateScope)

	return query
}

/**
 * Applies a framework-owned object identity without exposing it to Query hooks.
 *
 * @internal Pointer and relation handles are the only intended callers.
 */
export const scopeQueryToObjectId = <const TSchema extends SchemaDefinition>(
	query: Query<TSchema>,
	id: OperationObjectId<TSchema>,
	options: Readonly<{ readonly nativeAccessDeniedAsMissing?: true }> = {},
): Query<TSchema> => {
	const rowFilter = createQueryValueFilter(query.schema, 'equal', 'id', id)
	const scope: QueryTerminalPrivateScope = immutableRecord({
		kind: 'row-filter',
		...(options.nativeAccessDeniedAsMissing === undefined
			? {}
			: { nativeAccessDeniedAsMissing: true as const }),
		objectId: String(id),
		rowFilter,
	})

	return hydrateQueryFromAst(query.ast, scope)
}

/** Describes one trusted relation restriction before it enters private Query state. */
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
>(
	query: Query<TTarget>,
	input: QueryRelationScopeInput<TSource, TTarget>,
): Query<TTarget> => {
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

	return hydrateQueryFromAst(query.ast, scope)
}

/**
 * Executes an internal operation with the protected scope retained by a Query.
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
	query: Query<TSchema, TSelectedField, TIncludedPointer>,
	operation: TOperation,
	options?: QueryTerminalOptions,
): Promise<InferOperationResult<TOperation>> =>
	executeQueryTerminal(
		operation,
		normalizeQueryTerminalOptions(options),
		readQueryPrivateScope(query),
	)

/** Executes one schema-owned create command without inventing a meaningless Query. */
export const executeSchemaCreate = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: QueryTerminalOptions,
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

	return executeQueryTerminal(operation, normalizeQueryTerminalOptions(options))
}

/** Executes one ordered schema-owned bulk create command. */
export const executeSchemaCreateMany = <
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
	const normalizedOptions = normalizeQueryBulkTerminalOptions<TOptions>(options)
	const operation: CreateManyOperationAst<
		TSchema,
		QueryBulkAtomic<TOptions>,
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

	return executeQueryTerminal(operation, normalizedOptions)
}

/** Executes one singular update while retaining private Query restrictions. */
export const executeQueryUpdateOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: Query<TSchema, TSelectedField, TIncludedPointer>,
	input: UpdateExpressionInput<TSchema> & {},
	options?: QueryTerminalOptions,
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

/** Executes one set-based update while retaining private Query restrictions. */
export const executeQueryUpdateMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
>(
	query: Query<TSchema, TSelectedField>,
	input: UpdateExpressionInput<TSchema> & {},
	options?: QueryTerminalOptions,
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

/** Executes one unique-target upsert while retaining private Query restrictions. */
export const executeQueryUpsert = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: Query<TSchema, TSelectedField, TIncludedPointer>,
	input: UpsertInput<TSchema> & {},
	options?: QueryTerminalOptions,
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

/** Executes independently targeted upsert items without a container Query. */
export const executeSchemaUpsertMany = <
	const TSchema extends SchemaDefinition,
	const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
>(
	schema: TSchema,
	inputs: readonly UpsertManyItemInput<TSchema>[],
	selection: QuerySelection<TSchema> | undefined,
	options?: TOptions & QueryBulkTerminalOptions,
): Promise<
	QueryBulkTerminalResult<
		InferQueryResult<TSchema, QueryFieldName<TSchema>>,
		TOptions
	>
> => {
	const normalizedOptions = normalizeQueryBulkTerminalOptions<TOptions>(options)
	const operation: UpsertManyOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		QueryBulkAtomic<TOptions>,
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

	return executeQueryTerminal(operation, normalizedOptions)
}

/** Executes one singular delete while retaining private Query restrictions. */
export const executeQueryDeleteOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: Query<TSchema, TSelectedField, TIncludedPointer>,
	options?: QueryTerminalOptions,
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

/** Executes one set-based delete while retaining private Query restrictions. */
export const executeQueryDeleteMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
>(
	query: Query<TSchema, TSelectedField>,
	options?: QueryTerminalOptions,
): Promise<readonly InferQueryResult<TSchema, TSelectedField>[]> => {
	const operation: DeleteManyOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField
	> = immutableRecord({ kind: 'delete-many', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

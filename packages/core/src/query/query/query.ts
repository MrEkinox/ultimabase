import {
	Schema,
	type GenericField,
	type InferCreateInput,
	type SchemaDefinition,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
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
import { normalizeQuerySelection } from '../clauses/selection.js'
import {
	createQueryExistenceFilter,
	createQueryMembershipFilter,
	createQueryRegexFilter,
	createQueryValueFilter,
} from '../filters/factory.js'
import {
	normalizeLogicalFilter,
	type QueryFilterNode,
} from '../filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
	QueryPrimitiveFilterNode,
	QueryRegexPattern,
} from '../filters/primitive.js'
import {
	createQueryRelationPredicate,
	type QueryRelationPredicateForSchema,
	type RelationPredicate,
} from '../filters/relation.js'
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

type QueryComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type QueryStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

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
 *   .equalTo('published', true)
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

	/** Adds selected fields while keeping their first declaration order. */
	select<const TField extends QueryFieldName<TSchema>>(
		...fields: readonly TField[]
	): Query<TSchema, TSelectedField | TField, TIncludedPointer> {
		const selectedFields = this.ast.selection.fields.map(
			(selection) => selection.field,
		)

		return this.#with<TSelectedField | TField>({
			selection: normalizeQuerySelection(this.schema, [
				...selectedFields,
				...fields,
			]),
		})
	}

	/**
	 * Loads one pointer through an exact, independently shaped target Query.
	 *
	 * The callback only builds portable AST state. It performs no I/O, and a
	 * repeated field replaces its earlier shape without changing inclusion order.
	 *
	 * @example `Post.query().include('author', (query) => query.select('id', 'name'))`
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
				: normalizeQuerySelection(this.schema, [...selectionFields, fieldName])

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
	 * Adds an equality filter for the framework-owned object identifier.
	 *
	 * Existing filters and selections are preserved, so the resulting branch can
	 * execute any singular or collection terminal without repeating the `id` field.
	 *
	 * @example `query.byId(post.id).updateOne({ set: { title: "Updated" } })`
	 */
	byId(
		id: OperationObjectId<TSchema>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		// Every Schema includes the framework-owned UUID field, although TypeScript
		// cannot reduce that intersection through an arbitrary schema generic here.
		const idField = 'id' as QueryFilterFieldName<TSchema, 'equal'>

		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'equal', idField, id),
		)
	}

	/** Adds an equality condition to the implicit AND filter chain. */
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'equal', fieldName, value),
		)
	}

	/** Adds an inequality condition to the implicit AND filter chain. */
	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'not-equal', fieldName, value),
		)
	}

	/** Adds a strict greater-than comparison to the implicit AND filter chain. */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'greater-than', fieldName, value),
		)
	}

	/** Adds an inclusive lower bound to the implicit AND filter chain. */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(
				this.schema,
				'greater-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Adds a strict less-than comparison to the implicit AND filter chain. */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'less-than', fieldName, value),
		)
	}

	/** Adds an inclusive upper bound to the implicit AND filter chain. */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(
				this.schema,
				'less-than-or-equal',
				fieldName,
				value,
			),
		)
	}

	/** Adds an inclusion condition from a caller-owned candidate collection. */
	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryMembershipFilter(this.schema, 'in', fieldName, values),
		)
	}

	/** Adds an exclusion condition from a caller-owned candidate collection. */
	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryMembershipFilter(this.schema, 'not-in', fieldName, values),
		)
	}

	/** Adds a portable substring condition for a scalar string field. */
	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'contains', fieldName, value),
		)
	}

	/** Adds a portable prefix condition for a scalar string field. */
	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'starts-with', fieldName, value),
		)
	}

	/** Adds a portable suffix condition for a scalar string field. */
	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryValueFilter(this.schema, 'ends-with', fieldName, value),
		)
	}

	/** Adds a declarative regular-expression condition without executable state. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryRegexFilter(this.schema, fieldName, pattern),
		)
	}

	/** Adds a negative field-presence condition. */
	doesNotExist(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryExistenceFilter(this.schema, fieldName, false),
		)
	}

	/**
	 * Requires at least one related object to satisfy an exact target predicate.
	 * The callback can only build filters for the relation's target schema.
	 *
	 * @example `Post.query().some('tags', (tag) => tag.equalTo('label', 'typed'))`
	 */
	some<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryRelationPredicate(this.schema, 'some', fieldName, predicate),
		)
	}

	/**
	 * Requires no related object to satisfy an exact target predicate.
	 * An empty relationship satisfies this quantifier.
	 *
	 * @example `Post.query().none('tags', (tag) => tag.equalTo('label', 'blocked'))`
	 */
	none<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryRelationPredicate(this.schema, 'none', fieldName, predicate),
		)
	}

	/**
	 * Requires every visible related object to satisfy an exact target predicate.
	 * An empty relationship satisfies this quantifier.
	 *
	 * @example `Post.query().every('tags', (tag) => tag.equalTo('active', true))`
	 */
	every<TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
		predicate: (
			filter: RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
		) => RelationPredicate<SchemaRelationTarget<TSchema, TFieldName>>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#appendFilter(
			createQueryRelationPredicate(this.schema, 'every', fieldName, predicate),
		)
	}

	/** Combines the other query's filter with this query through AND. */
	and<TOtherSelection extends QueryFieldName<TSchema>, TOtherIncludedPointer>(
		query: Query<TSchema, TOtherSelection, TOtherIncludedPointer>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#combine(query, 'and', false)
	}

	/** Combines the other query's filter with this query through OR. */
	or<TOtherSelection extends QueryFieldName<TSchema>, TOtherIncludedPointer>(
		query: Query<TSchema, TOtherSelection, TOtherIncludedPointer>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#combine(query, 'or', false)
	}

	/** Adds the negation of the other query's filter through the implicit AND. */
	not<TOtherSelection extends QueryFieldName<TSchema>, TOtherIncludedPointer>(
		query: Query<TSchema, TOtherSelection, TOtherIncludedPointer>,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		return this.#combine(query, 'and', true)
	}

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

	/** Adds a positive field-presence condition without executing the query. */
	exists(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): Query<TSchema, TSelectedField, TIncludedPointer>

	exists(
		fieldNameOrOptions?:
			QueryFilterFieldName<TSchema, 'exists'> | QueryTerminalOptions,
	): Query<TSchema, TSelectedField, TIncludedPointer> | Promise<boolean> {
		if (typeof fieldNameOrOptions === 'string') {
			return this.#appendFilter(
				createQueryExistenceFilter(this.schema, fieldNameOrOptions, true),
			)
		}

		const operation: ExistsOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'exists', query: this.ast })

		return this.#execute(operation, fieldNameOrOptions)
	}

	/** Creates one object from its schema-derived input. */
	createOne(
		input: InferCreateInput<TSchema>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<TSchema>> {
		const operation: CreateOneOperationAst<TSchema> = immutableRecord({
			kind: 'create-one',
			schema: this.ast.schema,
			input,
		})

		return this.#execute(operation, options)
	}

	/** Provides the concise Parse-inspired alias for singular creation. */
	create(
		input: InferCreateInput<TSchema>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<TSchema>> {
		return this.createOne(input, options)
	}

	/**
	 * Creates objects in input order and keeps them atomic by default.
	 *
	 * Passing `{ atomic: false }` returns a discriminated result containing either
	 * every created model or the committed prefix and first failed input index.
	 *
	 * @example `await Post.query().createMany(inputs, { atomic: false, ultimabase })`
	 */
	createMany<
		const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
	>(
		inputs: readonly InferCreateInput<TSchema>[],
		options?: TOptions & QueryBulkTerminalOptions,
	): Promise<QueryBulkTerminalResult<InferQueryResult<TSchema>, TOptions>> {
		const normalizedOptions =
			normalizeQueryBulkTerminalOptions<TOptions>(options)
		const operation: CreateManyOperationAst<
			TSchema,
			QueryBulkAtomic<TOptions>
		> = immutableRecord({
			kind: 'create-many',
			schema: this.ast.schema,
			inputs: snapshotCreateInputs(inputs),
			options: normalizedOptions.bulk,
		})

		// Runtime validates the normalized atomic discriminant before mapping the
		// option-specific public collection result.
		return executeQueryTerminal(operation, normalizedOptions)
	}

	/** Updates the first match through one normalized atomic expression. */
	updateOne(
		input: UpdateExpressionInput<TSchema> & {},
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		const operation: UpdateOneOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({
			kind: 'update-one',
			query: this.ast,
			update: normalizeUpdateExpression(this.schema, input),
		})

		return this.#execute(operation, options)
	}

	/**
	 * Provides the concise singular alias for `updateOne`.
	 *
	 * Collection updates remain explicit through `updateMany` because they return
	 * an affected count rather than one selection-aware object.
	 *
	 * @example `await Post.query().byId(id).update({ set: { title: 'Updated' } })`
	 */
	update(
		input: UpdateExpressionInput<TSchema> & {},
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		return this.updateOne(input, options)
	}

	/** Updates every match and returns the affected count. */
	updateMany(
		input: UpdateExpressionInput<TSchema> & {},
		options?: QueryTerminalOptions,
	): Promise<number> {
		const operation: UpdateManyOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({
			kind: 'update-many',
			query: this.ast,
			update: normalizeUpdateExpression(this.schema, input),
		})

		return this.#execute(operation, options)
	}

	/** Upserts one unique match while retaining this query's selection. */
	upsertOne(
		input: UpsertInput<TSchema> & {},
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<TSchema, TSelectedField, TIncludedPointer>> {
		const normalizedInput = normalizeUpsertInput(this.schema, input)
		const operation: UpsertOneOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({
			kind: 'upsert-one',
			query: this.ast,
			target: normalizeUniqueUpsertTarget(this.schema, this.ast),
			...normalizedInput,
		})

		return this.#execute(operation, options)
	}

	/** Provides the concise alias for the singular unique-target operation. */
	upsert(
		input: UpsertInput<TSchema> & {},
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<TSchema, TSelectedField, TIncludedPointer>> {
		return this.upsertOne(input, options)
	}

	/**
	 * Upserts independently targeted items in input order.
	 *
	 * Passing `{ atomic: false }` exposes the same explicit stopped-prefix result
	 * as `createMany` while the default remains one all-or-nothing transaction.
	 *
	 * @example `await Post.query().upsertMany(items, { atomic: false, ultimabase })`
	 */
	upsertMany<
		const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
	>(
		inputs: readonly UpsertManyItemInput<TSchema>[],
		options?: TOptions & QueryBulkTerminalOptions,
	): Promise<QueryBulkTerminalResult<InferQueryResult<TSchema>, TOptions>> {
		const normalizedOptions =
			normalizeQueryBulkTerminalOptions<TOptions>(options)
		const operation: UpsertManyOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			QueryBulkAtomic<TOptions>
		> = immutableRecord({
			kind: 'upsert-many',
			schema: this.ast.schema,
			items: normalizeUpsertItems(this.schema, inputs),
			options: normalizedOptions.bulk,
		})

		// The adapter result follows the same atomic literal normalized above.
		return executeQueryTerminal(operation, normalizedOptions)
	}

	/** Deletes and returns the first match, or `null` when absent. */
	deleteOne(
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		const operation: DeleteOneOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField,
			TIncludedPointer
		> = immutableRecord({ kind: 'delete-one', query: this.ast })

		return this.#execute(operation, options)
	}

	/**
	 * Provides the concise singular alias for `deleteOne`.
	 *
	 * Collection deletion remains explicit through `deleteMany` because it is a
	 * set-based operation returning an affected count.
	 *
	 * @example `await Post.query().byId(id).delete()`
	 */
	delete(
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		TSelectedField,
		TIncludedPointer
	> | null> {
		return this.deleteOne(options)
	}

	/** Deletes every match without loading objects and returns its count. */
	deleteMany(options?: QueryTerminalOptions): Promise<number> {
		const operation: DeleteManyOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'delete-many', query: this.ast })

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
		logicalKind: 'and' | 'or' = 'and',
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		const currentExpression = this.ast.where?.expression
		const expression =
			currentExpression === undefined
				? filter
				: logicalKind === 'and'
					? normalizeLogicalFilter<
							| QueryPrimitiveFilterNode<TSchema>
							| QueryRelationPredicateForSchema<TSchema>
						>({
							kind: 'and',
							expressions: [currentExpression, filter],
						})
					: normalizeLogicalFilter<
							| QueryPrimitiveFilterNode<TSchema>
							| QueryRelationPredicateForSchema<TSchema>
						>({
							kind: 'or',
							expressions: [currentExpression, filter],
						})
		const where: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
			kind: 'where',
			expression,
		})

		return this.#with({ where })
	}

	#combine<
		TOtherSelection extends QueryFieldName<TSchema>,
		TOtherIncludedPointer,
	>(
		query: Query<TSchema, TOtherSelection, TOtherIncludedPointer>,
		logicalKind: 'and' | 'or',
		negate: boolean,
	): Query<TSchema, TSelectedField, TIncludedPointer> {
		if (query.schema !== this.schema) {
			throw new TypeError('logical queries must use the same schema definition')
		}

		const otherExpression = query.ast.where?.expression

		if (otherExpression === undefined) {
			return this.#with({})
		}

		const expression = negate
			? normalizeLogicalFilter<
					| QueryPrimitiveFilterNode<TSchema>
					| QueryRelationPredicateForSchema<TSchema>
				>({
					kind: 'not',
					expression: otherExpression,
				})
			: otherExpression

		return this.#appendFilter(expression, logicalKind)
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
 * surface. Runtime uses it to expose `beforeFind` without adding execution state
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
	const rowFilter = createQueryValueFilter(
		query.schema,
		'equal',
		'id' as QueryFieldName<TSchema>,
		id,
	)
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
	const TOperation extends OperationAstNode,
>(
	query: Query<TSchema>,
	operation: TOperation,
	options?: QueryTerminalOptions,
): Promise<InferOperationResult<TOperation>> =>
	executeQueryTerminal(
		operation,
		normalizeQueryTerminalOptions(options),
		readQueryPrivateScope(query),
	)

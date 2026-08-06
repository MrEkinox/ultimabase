import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from '../../access/index.js'
import type {
	OperationKind,
	QueryFilterFieldName,
	QueryFilterOperand,
	QueryFilterTarget,
	QueryFilterValue,
	QueryJsonPathExpression,
	QueryRegexPattern,
} from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type {
	FieldHookTypes,
	FieldOutputHookKind,
} from '../hooks/field-contracts.js'
import type {
	SchemaCreateHookKind,
	SchemaDeleteHookKind,
	SchemaReadHookKind,
	SchemaUpdateHookKind,
	SchemaUpsertHookKind,
} from '../hooks/contracts.js'
import type {
	InferCreateInput,
	InferObject,
	InferUpdateInput,
} from '../inference/types.js'
import type { SchemaDefinition } from '../schema/definition.js'

/** Represents one immutable row predicate owned by the Access lifecycle. */
export interface AccessFilter<TSchema extends SchemaDefinition> {
	/**
	 * Adds one schema-aware equality predicate.
	 * @example `filter.equalTo("authorId", principal.id)`
	 */
	equalTo<TTarget extends QueryFilterTarget<TSchema, 'equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'equal', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Adds one schema-aware inequality predicate.
	 * @example `filter.notEqualTo("status", "archived")`
	 */
	notEqualTo<TTarget extends QueryFilterTarget<TSchema, 'not-equal'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'not-equal', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Adds one strict lower-bound predicate.
	 * @example `filter.greaterThan("views", 100)`
	 */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Adds one inclusive lower-bound predicate.
	 * @example `filter.greaterThanOrEqualTo("score", 10)`
	 */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Adds one strict upper-bound predicate.
	 * @example `filter.lessThan("price", 100)`
	 */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Adds one inclusive upper-bound predicate.
	 * @example `filter.lessThanOrEqualTo("priority", 3)`
	 */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Requires an ordered field to remain inside one inclusive interval.
	 * @example `filter.between("score", 10, 20)`
	 */
	between<TFieldName extends QueryFilterFieldName<TSchema, 'between'>>(
		fieldName: TFieldName,
		lower: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
		upper: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Requires an ordered field to remain outside one inclusive interval.
	 * @example `filter.notBetween("score", 10, 20)`
	 */
	notBetween<TFieldName extends QueryFilterFieldName<TSchema, 'not-between'>>(
		fieldName: TFieldName,
		lower: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
		upper: Exclude<QueryFilterValue<TSchema, TFieldName>, null>,
	): AccessFilter<TSchema>
	/**
	 * Matches one field against an immutable candidate collection.
	 * @example `filter.containedIn("status", ["draft", "published"])`
	 */
	containedIn<TTarget extends QueryFilterTarget<TSchema, 'in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'in', TTarget>[],
	): AccessFilter<TSchema>
	/**
	 * Excludes one immutable candidate collection.
	 * @example `filter.notContainedIn("status", ["archived"])`
	 */
	notContainedIn<TTarget extends QueryFilterTarget<TSchema, 'not-in'>>(
		target: TTarget,
		values: readonly QueryFilterOperand<TSchema, 'not-in', TTarget>[],
	): AccessFilter<TSchema>
	/**
	 * Adds string substring matching or containment for a structured target.
	 * @example `filter.contains("title", "Ultima")`
	 */
	contains<TTarget extends QueryFilterTarget<TSchema, 'contains'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contains', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Requires one structured field or path to be contained by the supplied value.
	 * @example `filter.containedBy("metadata", { public: true, featured: true })`
	 */
	containedBy<TTarget extends QueryFilterTarget<TSchema, 'contained-by'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'contained-by', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Requires one top-level key on a structured field or path.
	 * @example `filter.hasKey("metadata", "visibility")`
	 */
	hasKey<TTarget extends QueryFilterTarget<TSchema, 'has-key'>>(
		target: TTarget,
		key: QueryFilterOperand<TSchema, 'has-key', TTarget> & string,
	): AccessFilter<TSchema>
	/**
	 * Requires at least one candidate key on a structured field or path.
	 * @example `filter.hasAnyKeys("metadata", ["public", "featured"])`
	 */
	hasAnyKeys<TTarget extends QueryFilterTarget<TSchema, 'has-any-keys'>>(
		target: TTarget,
		keys: readonly (QueryFilterOperand<TSchema, 'has-any-keys', TTarget> &
			string)[],
	): AccessFilter<TSchema>
	/**
	 * Requires every candidate key on a structured field or path.
	 * @example `filter.hasAllKeys("metadata", ["public", "featured"])`
	 */
	hasAllKeys<TTarget extends QueryFilterTarget<TSchema, 'has-all-keys'>>(
		target: TTarget,
		keys: readonly (QueryFilterOperand<TSchema, 'has-all-keys', TTarget> &
			string)[],
	): AccessFilter<TSchema>
	/**
	 * Tests whether an advanced JSONPath expression returns at least one item.
	 * @example `filter.jsonPathExists("metadata", { source: "$.items[*] ? (@.price > $minimum)", variables: { minimum: 10 } })`
	 */
	jsonPathExists(
		target: QueryFilterTarget<TSchema, 'json-path-exists'>,
		expression: QueryJsonPathExpression,
	): AccessFilter<TSchema>
	/**
	 * Evaluates one advanced JSONPath boolean predicate.
	 * @example `filter.jsonPathMatches("metadata", { source: "exists($.items[*] ? (@.price > $minimum))", variables: { minimum: 10 } })`
	 */
	jsonPathMatches(
		target: QueryFilterTarget<TSchema, 'json-path-matches'>,
		expression: QueryJsonPathExpression,
	): AccessFilter<TSchema>
	/**
	 * Adds one portable prefix predicate for a string field.
	 * @example `filter.startsWith("slug", "docs-")`
	 */
	startsWith<TTarget extends QueryFilterTarget<TSchema, 'starts-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'starts-with', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Adds one portable suffix predicate for a string field.
	 * @example `filter.endsWith("email", "@example.com")`
	 */
	endsWith<TTarget extends QueryFilterTarget<TSchema, 'ends-with'>>(
		target: TTarget,
		value: QueryFilterOperand<TSchema, 'ends-with', TTarget>,
	): AccessFilter<TSchema>
	/**
	 * Adds one inert regular-expression predicate without executable RegExp state.
	 * @example `filter.matches("slug", { source: "^public-", flags: [] })`
	 */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): AccessFilter<TSchema>
	/**
	 * Requires one declared field to contain a non-null value.
	 * @example `filter.isNotNull("publishedAt")`
	 */
	isNotNull(target: QueryFilterTarget<TSchema, 'null'>): AccessFilter<TSchema>
	/**
	 * Requires one declared field to contain null.
	 * @example `filter.isNull("publishedAt")`
	 */
	isNull(target: QueryFilterTarget<TSchema, 'null'>): AccessFilter<TSchema>
	/**
	 * Requires this branch and another branch to match.
	 * @example `published.and(filter.equalTo("authorId", principal.id))`
	 */
	and(filter: AccessFilter<TSchema>): AccessFilter<TSchema>
	/**
	 * Requires this branch or another branch to match.
	 * @example `published.or(filter.equalTo("authorId", principal.id))`
	 */
	or(filter: AccessFilter<TSchema>): AccessFilter<TSchema>
	/**
	 * Requires this branch and the negation of another branch to match.
	 * @example `visible.not(filter.equalTo("status", "archived"))`
	 */
	not(filter: AccessFilter<TSchema>): AccessFilter<TSchema>
}

/** Allows one direct decision or one cancellable request-aware decision. */
export type AccessDecisionRule<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

/** Allows a row rule to grant all rows, deny all rows, or return a restriction. */
export type AccessFilterRule<TSchema extends SchemaDefinition, TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean | AccessFilter<TSchema>>)

/** Supplies the exact terminal union covered by one operation-family rule. */
export interface SchemaOperationAccessInput<TKind extends OperationKind> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Retains the exact terminal for cardinality-specific narrowing. */
	readonly kind: TKind
}

/** Supplies an isolated typed predicate builder for one row-restricted family. */
export interface SchemaFilterAccessInput<TSchema extends SchemaDefinition> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Starts one private predicate branch shared by every family terminal. */
	readonly filter: AccessFilter<TSchema>
}

interface SchemaItemAccessBase<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Retains the exact terminal for cardinality-specific narrowing. */
	readonly kind: TKind
	/** Carries the prepared object evaluated inside the operation transaction. */
	readonly item: InferObject<TSchema>
}

/** Correlates item checks with the exact input available to their family. */
export type SchemaItemAccessInput<
	TSchema extends SchemaDefinition,
	TKind extends
		| SchemaCreateHookKind
		| SchemaUpdateHookKind
		| SchemaUpsertHookKind
		| SchemaDeleteHookKind,
> = TKind extends SchemaCreateHookKind
	? SchemaItemAccessBase<TSchema, TKind> &
			Readonly<{ input: InferCreateInput<TSchema>; mode: 'create' }>
	: TKind extends SchemaUpdateHookKind
		? SchemaItemAccessBase<TSchema, TKind> &
				Readonly<{ input: InferUpdateInput<TSchema>; mode: 'update' }>
		: TKind extends SchemaUpsertHookKind
			? | (SchemaItemAccessBase<TSchema, TKind> &
						Readonly<{ input: InferCreateInput<TSchema>; mode: 'create' }>)
				| (SchemaItemAccessBase<TSchema, TKind> &
						Readonly<{ input: InferUpdateInput<TSchema>; mode: 'update' }>)
			: SchemaItemAccessBase<TSchema, TKind>

/** Declares early allow-or-deny decisions by logical operation family. */
export interface SchemaReadOperationAccess {
	/**
	 * Controls singular object reads through `get` and `first`.
	 * @example `one: ({ kind }) => kind === "get"`
	 */
	readonly one: AccessDecisionRule<
		SchemaOperationAccessInput<'get' | 'find-one'>
	>
	/**
	 * Controls collection reads through `find`.
	 * @example `many: true`
	 */
	readonly many: AccessDecisionRule<SchemaOperationAccessInput<'find-many'>>
	/**
	 * Controls exact row counts without implicitly enabling other reads.
	 * @example `count: false`
	 */
	readonly count: AccessDecisionRule<SchemaOperationAccessInput<'count'>>
	/**
	 * Controls existence checks without implicitly enabling object output.
	 * @example `exists: true`
	 */
	readonly exists: AccessDecisionRule<SchemaOperationAccessInput<'exists'>>
}

/** Allows one shared read decision or one complete cardinality declaration. */
export type SchemaReadOperationAccessDeclaration =
	| AccessDecisionRule<SchemaOperationAccessInput<SchemaReadHookKind>>
	| SchemaReadOperationAccess

/** Declares early allow-or-deny decisions by logical operation family. */
export interface SchemaOperationAccess {
	/**
	 * Controls every read through one rule or explicit cardinality branches.
	 * @example `read: { one: true, many: true, count: false, exists: true }`
	 */
	readonly read?: SchemaReadOperationAccessDeclaration
	/**
	 * Controls singular and bulk creates through one reusable rule.
	 * @example `create: ({ context }) => context.access.mode === "master"`
	 */
	readonly create?: AccessDecisionRule<
		SchemaOperationAccessInput<SchemaCreateHookKind>
	>
	/**
	 * Controls singular and set-based updates through one reusable rule.
	 * @example `update: true`
	 */
	readonly update?: AccessDecisionRule<
		SchemaOperationAccessInput<SchemaUpdateHookKind>
	>
	/**
	 * Controls singular and bulk upserts through one reusable rule.
	 * @example `upsert: true`
	 */
	readonly upsert?: AccessDecisionRule<
		SchemaOperationAccessInput<SchemaUpsertHookKind>
	>
	/**
	 * Controls singular and set-based deletes through one reusable rule.
	 * @example `delete: ({ context }) => context.access.mode === "master"`
	 */
	readonly delete?: AccessDecisionRule<
		SchemaOperationAccessInput<SchemaDeleteHookKind>
	>
}

/** Declares database-enforceable row restrictions by logical family. */
export interface SchemaFilterAccess<TSchema extends SchemaDefinition> {
	/**
	 * Restricts every read terminal without mutating its public Query.
	 * @example `read: ({ filter }) => filter.equalTo("published", true)`
	 */
	readonly read?: AccessFilterRule<TSchema, SchemaFilterAccessInput<TSchema>>
	/**
	 * Restricts rows eligible for singular or set-based updates.
	 * @example `update: ({ filter }) => filter.equalTo("locked", false)`
	 */
	readonly update?: AccessFilterRule<TSchema, SchemaFilterAccessInput<TSchema>>
	/**
	 * Restricts rows considered by upsert target resolution.
	 * @example `upsert: true`
	 */
	readonly upsert?: AccessFilterRule<TSchema, SchemaFilterAccessInput<TSchema>>
	/**
	 * Restricts rows eligible for singular or set-based deletion.
	 * @example `delete: false`
	 */
	readonly delete?: AccessFilterRule<TSchema, SchemaFilterAccessInput<TSchema>>
}

/** Declares checks requiring one prepared input or materialized object. */
export interface SchemaItemAccess<TSchema extends SchemaDefinition> {
	/**
	 * Checks every prepared create item inside its transaction.
	 * @example `create: ({ input }) => input.title.length > 0`
	 */
	readonly create?: AccessDecisionRule<
		SchemaItemAccessInput<TSchema, SchemaCreateHookKind>
	>
	/**
	 * Checks one materialized update target; set-based updates cannot use it.
	 * @example `update: ({ item }) => item.locked === false`
	 */
	readonly update?: AccessDecisionRule<
		SchemaItemAccessInput<TSchema, SchemaUpdateHookKind>
	>
	/**
	 * Checks the exact create or update branch selected by an upsert item.
	 * @example `upsert: ({ mode }) => mode === "create"`
	 */
	readonly upsert?: AccessDecisionRule<
		SchemaItemAccessInput<TSchema, SchemaUpsertHookKind>
	>
	/**
	 * Checks one materialized delete target; set-based deletes cannot use it.
	 * @example `delete: ({ item }) => item.archived === true`
	 */
	readonly delete?: AccessDecisionRule<
		SchemaItemAccessInput<TSchema, SchemaDeleteHookKind>
	>
}

/** Groups schema-owned policies without introducing concrete permission concepts. */
export interface SchemaAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes an early decision before row, item, field, or business-hook work.
	 * @example `operation: { read: true, delete: false }`
	 */
	readonly operation?: SchemaOperationAccess
	/**
	 * Adds private row restrictions that later compose monotonically with `AND`.
	 * @example `filter: { read: ({ filter }) => filter.equalTo("published", true) }`
	 */
	readonly filter?: SchemaFilterAccess<TSchema>
	/**
	 * Evaluates rules requiring one prepared input or materialized target.
	 * @example `item: { update: ({ item }) => item.locked === false }`
	 */
	readonly item?: SchemaItemAccess<TSchema>
}

interface FieldAccessBaseInput<TKind extends OperationKind> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Retains the exact terminal that reached this field decision. */
	readonly kind: TKind
}

/** Groups terminals whose predicates may reference one protected field. */
export type FieldFilterAccessKind =
	| SchemaReadHookKind
	| SchemaUpdateHookKind
	| SchemaUpsertHookKind
	| SchemaDeleteHookKind

/** Supplies one present logical field value to a value-aware Access rule. */
export interface FieldValueAccessInput<
	TValue,
	TKind extends OperationKind,
> extends FieldAccessBaseInput<TKind> {
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

/** Supplies one field disclosure channel while retaining the exact terminal. */
export interface FieldReadAccessBaseInput<
	TChannel extends 'filter' | 'order',
	TKind extends OperationKind,
> extends FieldAccessBaseInput<TKind> {
	/** Distinguishes direct output from indirect filter or ordering disclosure. */
	readonly channel: TChannel
}

/** Supplies the exact logical value for one materialized field output. */
export interface FieldReadItemAccessInput<
	TValue,
	TKind extends OperationKind = FieldOutputHookKind,
> extends FieldValueAccessInput<TValue, TKind> {
	/** Identifies materialized field output within one shared read callback. */
	readonly channel: 'item'
}

/** Describes every way one field can disclose information during a read. */
export type FieldReadAccessInput<TField extends GenericField> =
	| FieldReadItemAccessInput<FieldHookTypes<TField>['object']>
	| FieldReadAccessBaseInput<'filter', FieldFilterAccessKind>
	| FieldReadAccessBaseInput<'order', SchemaReadHookKind>

/** Allows independent output, filter, and ordering disclosure decisions. */
export interface FieldReadAccess<TField extends GenericField> {
	/**
	 * Controls whether one materialized output may expose this field value.
	 * @example `item: ({ value }) => value.length > 0`
	 */
	readonly item: AccessDecisionRule<
		FieldReadItemAccessInput<FieldHookTypes<TField>['object']>
	>
	/**
	 * Controls whether callers may reference this field in a row predicate.
	 * @example `filter: false`
	 */
	readonly filter: AccessDecisionRule<
		FieldReadAccessBaseInput<'filter', FieldFilterAccessKind>
	>
	/**
	 * Controls whether callers may order read results by this field.
	 * @example `order: false`
	 */
	readonly order: AccessDecisionRule<
		FieldReadAccessBaseInput<'order', SchemaReadHookKind>
	>
}

/** Allows one shared disclosure rule or one complete channel declaration. */
export type FieldReadAccessDeclaration<TField extends GenericField> =
	AccessDecisionRule<FieldReadAccessInput<TField>> | FieldReadAccess<TField>

/** Controls one field independently from schema operation and item decisions. */
export interface FieldAccess<TField extends GenericField> {
	/**
	 * Controls output, filtering, and ordering through one rule or three channels.
	 * @example `read: { item: true, filter: false, order: false }`
	 */
	readonly read?: FieldReadAccessDeclaration<TField>
	/**
	 * Controls whether a present create input may set this field.
	 * @example `create: true`
	 */
	readonly create?: AccessDecisionRule<
		FieldValueAccessInput<
			FieldHookTypes<TField>['create'],
			SchemaCreateHookKind | SchemaUpsertHookKind
		>
	>
	/**
	 * Controls whether a present update input may change this field.
	 * @example `update: false`
	 */
	readonly update?: AccessDecisionRule<
		FieldValueAccessInput<
			FieldHookTypes<TField>['update'],
			SchemaUpdateHookKind | SchemaUpsertHookKind
		>
	>
}

/** Contextually types inline field rules without retaining them in metadata. */
export interface FieldAccessDeclaration<TField extends GenericField> {
	/**
	 * Declares grouped read disclosure plus create and update decisions.
	 *
	 * @example `access: { read: { item: true, filter: false, order: false } }`
	 */
	readonly access?: FieldAccess<NoInfer<TField>>
}

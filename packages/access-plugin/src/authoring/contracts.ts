import type { MaybePromise } from '@ultimabase/shared'
import type {
	FieldValueMap,
	GenericField,
	PolicyContext,
	RelationMutationDelta,
	SchemaDefinition,
	SchemaItem,
	SchemaPreparedDraft,
	SchemaResult,
	WhereBuilder,
	WhereInput,
} from '@ultimabase/core'

import type { PluginSourceSchemaPermissions } from '@ultimabase/core/plugin'

import type { AccessContext } from '../context.js'
import type { SchemaMutationAccessMap } from './schema-mutations.js'

type ReadPresentFieldValue<TFields> = TFields extends {
	readonly value?: infer TValue
}
	? 'value' extends keyof TFields
		? Exclude<TValue, undefined>
		: never
	: never

type AccessFieldValue<
	TField extends GenericField,
	TMode extends 'create' | 'object',
> = string extends TField['kind']
	? unknown
	: ReadPresentFieldValue<FieldValueMap<{ readonly value: TField }, TMode>>

/**
 * A boolean decision: `true`, `false` or a function returning one. Every
 * decision receives the Core policy context, so a `PolicyPredicate` such as
 * `isAuthenticated` is accepted wherever a rule returns a boolean (ADR-0304).
 */
export type AccessDecisionRule<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

/**
 * The request facts every Access rule receives: the Core `principal`, the
 * policy `operation` key and the `schema` class name (ADR-0304), beside the
 * request authority.
 */
export interface AccessPolicyInput extends PolicyContext {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
}

/** Adds one isolated typed where builder to the facts of an operation rule. */
export interface SchemaWhereAccessInput<
	TSchema extends SchemaDefinition,
> extends AccessPolicyInput {
	/** Builds the same immutable object contract accepted by public `where`. */
	readonly where: WhereBuilder<TSchema>
}

/** What an operation rule decides: every row (`true`), no row (`false`) or a row filter. */
export type AccessRuleResult<TSchema extends SchemaDefinition> =
	boolean | WhereBuilder<TSchema> | WhereInput<TSchema>

/**
 * One operation rule, evaluated before any row is loaded (ADR-0317): `true`
 * allows every row, `false` none, and a function returns one of them or a row
 * filter. A function that may return nothing is a type error.
 *
 * @example `read: ({ where }) => where.eq('published', true)`
 */
export type AccessRule<
	TSchema extends SchemaDefinition,
	TInput = SchemaWhereAccessInput<TSchema>,
> = boolean | ((input: TInput) => MaybePromise<AccessRuleResult<TSchema>>)

/** Correlates item checks with the materialized values available to one family. */
export type SchemaItemAccessInput<
	TSchema extends SchemaDefinition,
	TKind extends 'create' | 'delete' | 'update' | 'upsert',
> = TKind extends 'create'
	? AccessPolicyInput &
			Readonly<{
				item: SchemaPreparedDraft<TSchema>
			}>
	: TKind extends 'update'
		? AccessPolicyInput &
				Readonly<{
					item: Readonly<SchemaItem<TSchema>>
					originalItem: SchemaResult<TSchema>
				}>
		: TKind extends 'upsert'
			? AccessPolicyInput &
					(
						| Readonly<{
								item: SchemaPreparedDraft<TSchema>
								mode: 'create'
								originalItem: null
						  }>
						| Readonly<{
								item: Readonly<SchemaItem<TSchema>>
								mode: 'update'
								originalItem: SchemaResult<TSchema>
						  }>
					)
			: AccessPolicyInput &
					Readonly<{
						originalItem: SchemaResult<TSchema>
					}>

/** Decides creation, then checks each prepared draft. */
export interface SchemaCreateAccess<TSchema extends SchemaDefinition> {
	/**
	 * Decides the operation before any draft is prepared; nothing is loaded,
	 * so it returns a boolean.
	 * @example `where: isAuthenticated`
	 */
	readonly where: AccessDecisionRule<AccessPolicyInput>
	/**
	 * Checks every immutable prepared draft.
	 * @example `item: ({ item }) => item.title.length > 0`
	 */
	readonly item: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'create'>>
}

/** Rules an update before loading, then checks each original and candidate. */
export interface SchemaUpdateAccess<TSchema extends SchemaDefinition> {
	/**
	 * The operation rule: every row, no row, or the rows that may be updated.
	 * @example `where: ({ principal }) => principal !== undefined`
	 */
	readonly where: AccessRule<TSchema>
	/**
	 * Checks the locked original and its final candidate.
	 * @example `item: ({ item, originalItem }) => item.author === originalItem.author`
	 */
	readonly item: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'update'>>
}

/** Rules an upsert before loading, then checks the branch the database selects. */
export interface SchemaUpsertAccess<TSchema extends SchemaDefinition> {
	/**
	 * The operation rule: every row, no row, or the rows that may be updated.
	 * @example `where: true`
	 */
	readonly where: AccessRule<TSchema>
	/**
	 * Checks the selected branch.
	 * @example `item: ({ mode }) => mode === "create"`
	 */
	readonly item: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'upsert'>>
}

/** Rules a deletion before loading, then checks each persisted target. */
export interface SchemaDeleteAccess<TSchema extends SchemaDefinition> {
	/**
	 * The operation rule: every row, no row, or the rows that may be deleted.
	 * @example `where: ({ where }) => where.eq('archived', true)`
	 */
	readonly where: AccessRule<TSchema>
	/**
	 * Checks the persisted target.
	 * @example `item: ({ originalItem }) => originalItem.archived`
	 */
	readonly item: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'delete'>>
}

/**
 * The native keys of a schema rule (ADR-0347), from the broadest to the most
 * precise: `all`, a group (`read`, `write`), an operation, a read method.
 * The most precise key present decides each method; write methods such as
 * `createMany` are not keys, so a write rule never depends on cardinality.
 */
interface NativeSchemaAccess<TSchema extends SchemaDefinition> {
	/**
	 * Every read and write, request plugin operations included; never a
	 * plugin permission. A value or a predicate.
	 * @example `all: hasRole(Admin)`
	 */
	readonly all?: AccessDecisionRule<AccessPolicyInput>
	/**
	 * The reads `find`, `count` and `exists`.
	 * @example `read: ({ where }) => where.eq('published', true)`
	 */
	readonly read?: AccessRule<TSchema>
	/**
	 * Every write: `create`, `update`, `upsert`, `delete` and request plugin
	 * operations, including those of plugins installed later. A value or a
	 * predicate.
	 * @example `write: isAuthenticated`
	 */
	readonly write?: AccessDecisionRule<AccessPolicyInput>
	/**
	 * Reading one row (`findOne`) and listing rows (`findMany`).
	 * @example `find: true`
	 */
	readonly find?: AccessRule<TSchema>
	/**
	 * Reading one row through `findOne`.
	 * @example `findOne: true`
	 */
	readonly findOne?: AccessRule<TSchema>
	/**
	 * Listing rows through `findMany`.
	 * @example `findMany: ({ where }) => where.eq('published', true)`
	 */
	readonly findMany?: AccessRule<TSchema>
	/**
	 * Exact row counts, without enabling other reads.
	 * @example `count: false`
	 */
	readonly count?: AccessRule<TSchema>
	/**
	 * Existence checks, without enabling object output.
	 * @example `exists: true`
	 */
	readonly exists?: AccessRule<TSchema>
	/**
	 * Rules creation: a boolean decision, or `{ where, item }` to check drafts.
	 * @example `create: isAuthenticated`
	 */
	readonly create?:
		AccessDecisionRule<AccessPolicyInput> | SchemaCreateAccess<TSchema>
	/**
	 * Rules updates: a rule, or `{ where, item }` to check each candidate.
	 * @example `update: ({ principal, where }) => principal ? where.eq('author', principal.id) : false`
	 */
	readonly update?: AccessRule<TSchema> | SchemaUpdateAccess<TSchema>
	/**
	 * Rules upserts: a rule, or `{ where, item }` to check the selected branch.
	 * @example `upsert: false`
	 */
	readonly upsert?: AccessRule<TSchema> | SchemaUpsertAccess<TSchema>
	/**
	 * Rules deletion: a rule, or `{ where, item }` to check each target.
	 * @example `delete: hasRole(Admin)`
	 */
	readonly delete?: AccessRule<TSchema> | SchemaDeleteAccess<TSchema>
}

/**
 * Grants the permissions plugins declare on this schema, such as Soft
 * Delete's `readDeleted` (ADR-0317): `true`, `false` or a predicate. Without
 * a rule, only the permission's own `allowWithoutRule` key grants it.
 */
export type SchemaPermissionAccessMap<TSource> = Readonly<
	Partial<
		Record<
			PluginSourceSchemaPermissions<TSource>,
			AccessDecisionRule<AccessPolicyInput>
		>
	>
>

/**
 * Combines native keys, request plugin operations and plugin permissions.
 * `TSource` is the schema whose statics carry the commands and permissions:
 * the registered schema when `TSchema` is a `SchemaRef` (ADR-0297).
 */
export type SchemaAccess<
	TSchema extends SchemaDefinition,
	TSource = TSchema,
> = Readonly<{
	[
		TKey in
			| keyof NativeSchemaAccess<TSchema>
			| keyof SchemaMutationAccessMap<TSchema, TSource>
			| keyof SchemaPermissionAccessMap<TSource>
	]?: TKey extends keyof NativeSchemaAccess<TSchema>
		? Exclude<NativeSchemaAccess<TSchema>[TKey], undefined>
		: TKey extends keyof SchemaMutationAccessMap<TSchema, TSource>
			? Exclude<SchemaMutationAccessMap<TSchema, TSource>[TKey], undefined>
			: TKey extends keyof SchemaPermissionAccessMap<TSource>
				? Exclude<SchemaPermissionAccessMap<TSource>[TKey], undefined>
				: never
}>

/** Supplies immutable request authority to one field decision. */
export interface FieldAccessInput extends PolicyContext {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
}

/** Supplies one present logical field value to a value-aware Access rule. */
export interface FieldValueAccessInput<TValue> extends FieldAccessInput {
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

/**
 * Describes every way one logical field value can disclose information; an
 * omitted member restricts nothing (ADR-0317).
 */
export interface FieldReadAccessFor<TValue> {
	/**
	 * Controls each concrete output value and structurally omits denied properties.
	 * @example `output: ({ value }) => value.length > 0`
	 */
	readonly output?: AccessDecisionRule<FieldValueAccessInput<TValue>>
	/**
	 * Controls whether callers may reference this field in a `where` predicate.
	 * @example `where: false`
	 */
	readonly where?: AccessDecisionRule<FieldAccessInput>
	/**
	 * Controls whether callers may reference this field in `orderBy`.
	 * @example `orderBy: false`
	 */
	readonly orderBy?: AccessDecisionRule<FieldAccessInput>
}

/** Resolves the read contract from one exact declared field. */
export type FieldReadAccess<TField extends GenericField> = FieldReadAccessFor<
	AccessFieldValue<TField, 'object'>
>

/** Applies one boolean to every read channel or rules some channels. */
export type FieldReadAccessDeclaration<TField extends GenericField> =
	boolean | FieldReadAccess<TField>

/** Supplies the final non-null value that fills one previously empty field. */
export interface FieldFillAccessInput<TValue> extends FieldAccessInput {
	/** Contains the final candidate after every update operator is applied. */
	readonly value: Exclude<TValue, null>
}

/** Supplies the persisted and final non-null values for one replacement. */
export interface FieldReplaceAccessInput<TValue> extends FieldAccessInput {
	/** Contains the non-null value visible before the update. */
	readonly originalValue: Exclude<TValue, null>
	/** Contains the final non-null candidate after every update operator. */
	readonly value: Exclude<TValue, null>
}

/** Supplies the value visible before an update resolves to canonical null. */
export interface FieldClearAccessInput<TValue> extends FieldAccessInput {
	/** May itself be null when a caller explicitly clears an already empty field. */
	readonly originalValue: TValue
}

/**
 * Rules generic field value transitions; an omitted member restricts nothing
 * (ADR-0317).
 */
export interface FieldWriteAccessFor<TCreateValue, TObjectValue> {
	/**
	 * Controls every transition from canonical null to a non-null value.
	 * @example `fill: ({ value }) => value.length > 0`
	 */
	readonly fill?: AccessDecisionRule<
		FieldFillAccessInput<TCreateValue | TObjectValue>
	>
	/**
	 * Controls updates from one non-null value to another non-null value.
	 * @example `replace: ({ originalValue, value }) => originalValue !== value`
	 */
	readonly replace?: AccessDecisionRule<FieldReplaceAccessInput<TObjectValue>>
	/**
	 * Controls every update whose final candidate is canonical null.
	 * @example `clear: false`
	 */
	readonly clear?: AccessDecisionRule<FieldClearAccessInput<TObjectValue>>
}

/** Resolves transition values from one exact declared field. */
export type FieldWriteAccess<TField extends GenericField> = FieldWriteAccessFor<
	AccessFieldValue<TField, 'create'>,
	AccessFieldValue<TField, 'object'>
>

/** Applies one boolean to every write or rules some transitions. */
export type FieldWriteAccessDeclaration<TField extends GenericField> =
	boolean | FieldWriteAccess<TField>

/** Supplies one immutable relation change without exposing adapter state. */
export interface RelationFieldWriteAccessInput<
	TTarget extends SchemaDefinition,
> extends FieldAccessInput {
	readonly change: RelationMutationDelta<TTarget>
}

/** Controls relation traversal and logical edge mutation independently. */
export interface RelationFieldAccess<TTarget extends SchemaDefinition> {
	readonly read?: AccessDecisionRule<FieldAccessInput>
	readonly write?: AccessDecisionRule<RelationFieldWriteAccessInput<TTarget>>
}

/** Controls one field through its disclosure and value-transition boundaries. */
export interface FieldAccess<TField extends GenericField> {
	/**
	 * Controls output, where predicates, and ordering together or separately.
	 * @example `read: { where: false, orderBy: false }`
	 */
	readonly read?: FieldReadAccessDeclaration<TField>
	/**
	 * Controls every write together or through fill, replace, and clear.
	 * @example `write: { clear: false }`
	 */
	readonly write?: FieldWriteAccessDeclaration<TField>
}

/** Types generated field options without recursively retaining their own option. */
export interface FieldAccessFor<TCreateValue, TObjectValue> {
	readonly read?: boolean | FieldReadAccessFor<TObjectValue>
	readonly write?: boolean | FieldWriteAccessFor<TCreateValue, TObjectValue>
}

/** Contextually types inline field rules without retaining them in metadata. */
export interface FieldAccessDeclaration<TField extends GenericField> {
	/**
	 * Declares grouped read disclosure and write-transition decisions.
	 *
	 * @example `access: { read: { where: false }, write: false }`
	 */
	readonly access?: FieldAccess<NoInfer<TField>>
}

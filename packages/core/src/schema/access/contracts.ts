import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from '../../access/index.js'
import type {
	OperationKind,
	WhereBuilder,
	WhereInput,
} from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type {
	FieldHookTypes,
	FieldOutputHookKind,
} from '../hooks/field-contracts.js'
import type {
	SchemaDeleteHookKind,
	SchemaMutationKind,
	SchemaReadHookKind,
	SchemaUpdateHookKind,
	SchemaUpsertHookKind,
} from '../hooks/contracts.js'
import type { InferObject } from '../inference/types.js'
import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaPreparedDraft, SchemaResult } from '../schema/model.js'

/** Allows one direct decision or one cancellable request-aware decision. */
export type AccessDecisionRule<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

/** Allows a row rule to grant all rows, deny all rows, or return one typed where restriction. */
export type AccessFilterRule<TSchema extends SchemaDefinition, TInput> =
	| boolean
	| ((
			input: TInput,
	  ) => MaybePromise<boolean | WhereBuilder<TSchema> | WhereInput<TSchema>>)

/** Supplies request authority to one explicitly named operation rule. */
export interface SchemaOperationAccessInput {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
}

/** Supplies an isolated typed where builder for one row-restricted family. */
export interface SchemaFilterAccessInput<TSchema extends SchemaDefinition> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Builds one policy branch with the same immutable operators as public `where`. */
	readonly where: WhereBuilder<TSchema>
}

interface SchemaItemAccessBase<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
	TItem extends
		Readonly<InferObject<TSchema>> | SchemaPreparedDraft<TSchema> | null,
> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Identifies the item-oriented mutation independently from cardinality. */
	readonly kind: TKind
	/** Carries the immutable draft, candidate, or null produced by this family. */
	readonly item: TItem
}

/** Correlates item checks with the materialized values available to their family. */
export type SchemaItemAccessInput<
	TSchema extends SchemaDefinition,
	TKind extends SchemaMutationKind,
> = TKind extends 'create'
	? SchemaItemAccessBase<TSchema, TKind, SchemaPreparedDraft<TSchema>>
	: TKind extends 'update'
		? SchemaItemAccessBase<TSchema, TKind, Readonly<InferObject<TSchema>>> &
				Readonly<{ originalItem: SchemaResult<TSchema> }>
		: TKind extends 'upsert'
			? | (SchemaItemAccessBase<TSchema, TKind, SchemaPreparedDraft<TSchema>> &
						Readonly<{ mode: 'create'; originalItem: null }>)
				| (SchemaItemAccessBase<
						TSchema,
						TKind,
						Readonly<InferObject<TSchema>>
				  > &
						Readonly<{
							mode: 'update'
							originalItem: SchemaResult<TSchema>
						}>)
			: SchemaItemAccessBase<TSchema, TKind, null> &
					Readonly<{ originalItem: SchemaResult<TSchema> }>

/** Declares early allow-or-deny decisions by logical operation family. */
export interface SchemaReadOperationAccess {
	/**
	 * Controls singular object reads through `get` and `first`.
	 * @example `one: ({ context }) => context.access.mode === "master"`
	 */
	readonly one: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls collection reads through `find`.
	 * @example `many: true`
	 */
	readonly many: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls exact row counts without implicitly enabling other reads.
	 * @example `count: false`
	 */
	readonly count: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls existence checks without implicitly enabling object output.
	 * @example `exists: true`
	 */
	readonly exists: AccessDecisionRule<SchemaOperationAccessInput>
}

/** Allows one shared read decision or one complete cardinality declaration. */
export type SchemaReadOperationAccessDeclaration =
	AccessDecisionRule<SchemaOperationAccessInput> | SchemaReadOperationAccess

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
	readonly create?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls singular and set-based updates through one reusable rule.
	 * @example `update: true`
	 */
	readonly update?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls singular and bulk upserts through one reusable rule.
	 * @example `upsert: true`
	 */
	readonly upsert?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls singular and set-based deletes through one reusable rule.
	 * @example `delete: ({ context }) => context.access.mode === "master"`
	 */
	readonly delete?: AccessDecisionRule<SchemaOperationAccessInput>
}

/** Declares database-enforceable row restrictions by logical family. */
export interface SchemaFilterAccess<TSchema extends SchemaDefinition> {
	/**
	 * Restricts every read terminal without mutating its public QueryBuilder.
	 * @example `read: () => ({ published: { eq: true } })`
	 */
	readonly read?: AccessFilterRule<TSchema, SchemaFilterAccessInput<TSchema>>
	/**
	 * Restricts rows eligible for singular or set-based updates.
	 * @example `update: ({ where }) => where.eq("locked", false)`
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
	 * @example `create: ({ item }) => item.title.length > 0`
	 */
	readonly create?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'create'>>
	/**
	 * Checks one persisted target and its final update candidate.
	 * @example `update: ({ originalItem, item }) => !originalItem.locked && item.ownerId === originalItem.ownerId`
	 */
	readonly update?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'update'>>
	/**
	 * Checks the exact create or update branch selected by an upsert item.
	 * @example `upsert: ({ mode }) => mode === "create"`
	 */
	readonly upsert?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'upsert'>>
	/**
	 * Checks one persisted delete target while the resulting item is null.
	 * @example `delete: ({ originalItem }) => originalItem.archived === true`
	 */
	readonly delete?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'delete'>>
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
	 * @example `filter: { read: () => ({ published: { eq: true } }) }`
	 */
	readonly filter?: SchemaFilterAccess<TSchema>
	/**
	 * Evaluates rules requiring one prepared draft or persisted candidate pair.
	 * @example `item: { update: ({ originalItem, item }) => item.ownerId === originalItem.ownerId }`
	 */
	readonly item?: SchemaItemAccess<TSchema>
}

interface FieldAccessBaseInput<
	TKind extends OperationKind | SchemaMutationKind,
> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Identifies the relevant terminal or item-oriented mutation family. */
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
	TKind extends OperationKind | SchemaMutationKind,
> extends FieldAccessBaseInput<TKind> {
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

/** Supplies one field's persisted and final candidate values to update Access. */
export interface FieldUpdateAccessInput<TValue> extends FieldAccessBaseInput<
	'update' | 'upsert'
> {
	/** Contains the field value visible before applying the update. */
	readonly originalValue: TValue
	/** Contains the final candidate value after applying every update operator. */
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
	 * Controls each concrete output value and structurally omits denied properties.
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
	 * Controls each present concrete create value, including nested list entries.
	 * @example `create: true`
	 */
	readonly create?: AccessDecisionRule<
		FieldValueAccessInput<FieldHookTypes<TField>['create'], 'create' | 'upsert'>
	>
	/**
	 * Controls a field change through its persisted and final candidate values.
	 * @example `update: ({ originalValue, value }) => value >= originalValue`
	 */
	readonly update?: AccessDecisionRule<
		FieldUpdateAccessInput<FieldHookTypes<TField>['object']>
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

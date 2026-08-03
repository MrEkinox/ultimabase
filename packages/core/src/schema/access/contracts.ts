import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from '../../access/index.js'
import type {
	OperationKind,
	QueryFilterFieldName,
	QueryFilterValue,
} from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type {
	FieldHookTypes,
	FieldOutputHookKind,
} from '../hooks/field-contracts.js'
import type {
	SchemaCreateHookKind,
	SchemaDeleteHookKind,
	SchemaFindHookKind,
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
	/** Adds one schema-aware equality predicate without exposing Query terminals. */
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): AccessFilter<TSchema>
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
export type SchemaFilterAccessInput<
	TSchema extends SchemaDefinition,
	TKind extends OperationKind,
> = SchemaOperationAccessInput<TKind> &
	Readonly<{
		/** Starts one private predicate branch for this schema. */
		filter: AccessFilter<TSchema>
	}>

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
export interface SchemaOperationAccess {
	/**
	 * Controls `find`, `first`, `get`, `count`, and `exists`.
	 * @example `read: true`
	 */
	readonly read?: AccessDecisionRule<
		SchemaOperationAccessInput<SchemaFindHookKind>
	>
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
	readonly read?: AccessFilterRule<
		TSchema,
		SchemaFilterAccessInput<TSchema, SchemaFindHookKind>
	>
	/**
	 * Restricts rows eligible for singular or set-based updates.
	 * @example `update: ({ filter }) => filter.equalTo("locked", false)`
	 */
	readonly update?: AccessFilterRule<
		TSchema,
		SchemaFilterAccessInput<TSchema, SchemaUpdateHookKind>
	>
	/**
	 * Restricts rows considered by upsert target resolution.
	 * @example `upsert: true`
	 */
	readonly upsert?: AccessFilterRule<
		TSchema,
		SchemaFilterAccessInput<TSchema, SchemaUpsertHookKind>
	>
	/**
	 * Restricts rows eligible for singular or set-based deletion.
	 * @example `delete: false`
	 */
	readonly delete?: AccessFilterRule<
		TSchema,
		SchemaFilterAccessInput<TSchema, SchemaDeleteHookKind>
	>
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
	| SchemaFindHookKind
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

/** Controls one field independently from schema operation and item decisions. */
export interface FieldAccess<TField extends GenericField> {
	/**
	 * Controls whether selected output may expose one present field value.
	 * @example `read: ({ context }) => context.access.mode === "master"`
	 */
	readonly read?: AccessDecisionRule<
		FieldValueAccessInput<FieldHookTypes<TField>['object'], FieldOutputHookKind>
	>
	/**
	 * Controls whether callers may reference this field in a row predicate.
	 * @example `filter: false`
	 */
	readonly filter?: AccessDecisionRule<
		FieldAccessBaseInput<FieldFilterAccessKind>
	>
	/**
	 * Controls whether callers may order read results by this field.
	 * @example `order: false`
	 */
	readonly order?: AccessDecisionRule<FieldAccessBaseInput<SchemaFindHookKind>>
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
	 * Declares access for this field's read, filter, order, create, and update uses.
	 *
	 * @example `access: { read: ({ context }) => context.access.mode === "master" }`
	 */
	readonly access?: FieldAccess<NoInfer<TField>>
}

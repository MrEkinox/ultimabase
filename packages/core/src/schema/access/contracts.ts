import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from '../../access/index.js'
import type { WhereBuilder, WhereInput } from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type { FieldHookTypes } from '../hooks/field-contracts.js'
import type { InferObject } from '../inference/types.js'
import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaPreparedDraft, SchemaResult } from '../schema/model.js'

/** Allows one direct decision or one cancellable request-aware decision. */
export type AccessDecisionRule<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

/** Supplies request authority to one explicitly named operation rule. */
export interface SchemaOperationAccessInput {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
}

/** Supplies one isolated typed where builder for a dynamic row restriction. */
export interface SchemaWhereAccessInput<TSchema extends SchemaDefinition> {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
	/** Builds the same immutable object contract accepted by public `where`. */
	readonly where: WhereBuilder<TSchema>
}

/**
 * Declares one static or request-aware row restriction.
 *
 * Returning `undefined` contributes no additional restriction. Complete denial
 * belongs to the containing operation's `allow` rule rather than `where`.
 */
export type AccessWhereRule<TSchema extends SchemaDefinition> =
	| WhereInput<TSchema>
	| ((
			input: SchemaWhereAccessInput<TSchema>,
	  ) => MaybePromise<WhereBuilder<TSchema> | WhereInput<TSchema> | undefined>)

/** Correlates item checks with the materialized values available to one family. */
export type SchemaItemAccessInput<
	TSchema extends SchemaDefinition,
	TKind extends 'create' | 'delete' | 'update' | 'upsert',
> = TKind extends 'create'
	? Readonly<{
			context: AccessContext
			item: SchemaPreparedDraft<TSchema>
		}>
	: TKind extends 'update'
		? Readonly<{
				context: AccessContext
				item: Readonly<InferObject<TSchema>>
				originalItem: SchemaResult<TSchema>
			}>
		: TKind extends 'upsert'
			? | Readonly<{
						context: AccessContext
						item: SchemaPreparedDraft<TSchema>
						mode: 'create'
						originalItem: null
				  }>
				| Readonly<{
						context: AccessContext
						item: Readonly<InferObject<TSchema>>
						mode: 'update'
						originalItem: SchemaResult<TSchema>
				  }>
			: Readonly<{
					context: AccessContext
					originalItem: SchemaResult<TSchema>
				}>

/** Declares read capabilities without exposing Runtime terminal names. */
export interface SchemaReadAllowAccess {
	/**
	 * Controls singular object reads through `get` and `findOne`.
	 * @example `one: true`
	 */
	readonly one: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls collection reads through `findMany`.
	 * @example `many: true`
	 */
	readonly many: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls exact row counts without enabling other reads.
	 * @example `count: false`
	 */
	readonly count: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Controls existence checks without enabling object output.
	 * @example `exists: true`
	 */
	readonly exists: AccessDecisionRule<SchemaOperationAccessInput>
}

/** Allows one shared read decision or one complete capability declaration. */
export type SchemaReadAllowAccessDeclaration =
	AccessDecisionRule<SchemaOperationAccessInput> | SchemaReadAllowAccess

/** Groups the operation decision and private row universe for reads. */
export interface SchemaReadAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes the early read decision, optionally by public read capability.
	 * @example `allow: { one: true, many: true, count: false, exists: true }`
	 */
	readonly allow?: SchemaReadAllowAccessDeclaration
	/**
	 * Adds one private row restriction shared by every read capability.
	 * @example `where: { published: { eq: true } }`
	 */
	readonly where?: AccessWhereRule<TSchema>
}

/** Groups the operation and prepared-item decisions for creation. */
export interface SchemaCreateAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes the early create decision before item materialization.
	 * @example `allow: true`
	 */
	readonly allow?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Checks every immutable prepared draft.
	 * @example `item: ({ item }) => item.title.length > 0`
	 */
	readonly item?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'create'>>
}

/** Groups every decision that can constrain an update. */
export interface SchemaUpdateAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes the early update decision before resolving a target.
	 * @example `allow: true`
	 */
	readonly allow?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Restricts rows eligible for update.
	 * @example `where: { locked: { eq: false } }`
	 */
	readonly where?: AccessWhereRule<TSchema>
	/**
	 * Checks a target and its final candidate.
	 * @example `item: ({ item }) => item.title.length > 0`
	 */
	readonly item?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'update'>>
}

/** Groups every decision that can constrain an upsert. */
export interface SchemaUpsertAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes the early upsert decision.
	 * @example `allow: true`
	 */
	readonly allow?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Restricts conflict targets.
	 * @example `where: { locked: { eq: false } }`
	 */
	readonly where?: AccessWhereRule<TSchema>
	/**
	 * Checks the selected branch.
	 * @example `item: ({ mode }) => mode === "create"`
	 */
	readonly item?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'upsert'>>
}

/** Groups every decision that can constrain deletion. */
export interface SchemaDeleteAccess<TSchema extends SchemaDefinition> {
	/**
	 * Makes the early delete decision before resolving a target.
	 * @example `allow: false`
	 */
	readonly allow?: AccessDecisionRule<SchemaOperationAccessInput>
	/**
	 * Restricts rows eligible for deletion.
	 * @example `where: { protected: { eq: false } }`
	 */
	readonly where?: AccessWhereRule<TSchema>
	/**
	 * Checks the persisted target.
	 * @example `item: ({ originalItem }) => originalItem.archived`
	 */
	readonly item?: AccessDecisionRule<SchemaItemAccessInput<TSchema, 'delete'>>
}

/** Allows one concise operation decision or its complete staged declaration. */
export type SchemaOperationAccessDeclaration<TDetails> =
	AccessDecisionRule<SchemaOperationAccessInput> | TDetails

/** Groups every schema policy by the operation developers are authorizing. */
export interface SchemaAccess<TSchema extends SchemaDefinition> {
	/**
	 * Controls read capabilities and their mandatory private row universe.
	 * @example `read: { allow: true, where: { published: { eq: true } } }`
	 */
	readonly read?: SchemaOperationAccessDeclaration<SchemaReadAccess<TSchema>>
	/**
	 * Controls creation before and after one immutable draft is prepared.
	 * @example `create: { allow: true, item: ({ item }) => item.title.length > 0 }`
	 */
	readonly create?: SchemaOperationAccessDeclaration<
		SchemaCreateAccess<TSchema>
	>
	/**
	 * Controls update permission, eligible rows, and final candidates together.
	 * @example `update: { where: { locked: { eq: false } }, item: ({ item }) => item.title.length > 0 }`
	 */
	readonly update?: SchemaOperationAccessDeclaration<
		SchemaUpdateAccess<TSchema>
	>
	/**
	 * Controls both materialized upsert branches without exposing cardinality.
	 * @example `upsert: { allow: true, item: ({ mode }) => mode === "create" }`
	 */
	readonly upsert?: SchemaOperationAccessDeclaration<
		SchemaUpsertAccess<TSchema>
	>
	/**
	 * Controls delete permission, eligible rows, and the persisted target.
	 * @example `delete: { allow: false }`
	 */
	readonly delete?: SchemaOperationAccessDeclaration<
		SchemaDeleteAccess<TSchema>
	>
}

/** Supplies immutable request authority to one field decision. */
export interface FieldAccessInput {
	/** Carries immutable authority and explicitly typed request capabilities. */
	readonly context: AccessContext
}

/** Supplies one present logical field value to a value-aware Access rule. */
export interface FieldValueAccessInput<TValue> extends FieldAccessInput {
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

/** Describes every way one field can disclose information during a read. */
export interface FieldReadAccess<TField extends GenericField> {
	/**
	 * Controls each concrete output value and structurally omits denied properties.
	 * @example `output: ({ value }) => value.length > 0`
	 */
	readonly output: AccessDecisionRule<
		FieldValueAccessInput<FieldHookTypes<TField>['object']>
	>
	/**
	 * Controls whether callers may reference this field in a `where` predicate.
	 * @example `where: false`
	 */
	readonly where: AccessDecisionRule<FieldAccessInput>
	/**
	 * Controls whether callers may reference this field in `orderBy`.
	 * @example `orderBy: false`
	 */
	readonly orderBy: AccessDecisionRule<FieldAccessInput>
}

/** Applies one boolean to every read channel or declares each channel explicitly. */
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

/** Declares every update transition explicitly. */
export interface FieldUpdateAccess<TField extends GenericField> {
	/**
	 * Controls updates from canonical null to a non-null value.
	 * @example `fill: ({ value }) => value.length > 0`
	 */
	readonly fill: AccessDecisionRule<
		FieldFillAccessInput<FieldHookTypes<TField>['object']>
	>
	/**
	 * Controls updates from one non-null value to another non-null value.
	 * @example `replace: ({ originalValue, value }) => originalValue !== value`
	 */
	readonly replace: AccessDecisionRule<
		FieldReplaceAccessInput<FieldHookTypes<TField>['object']>
	>
	/**
	 * Controls every update whose final candidate is canonical null.
	 * @example `clear: false`
	 */
	readonly clear: AccessDecisionRule<
		FieldClearAccessInput<FieldHookTypes<TField>['object']>
	>
}

/** Applies one update decision to every transition or requires all three branches. */
export type FieldUpdateAccessDeclaration<TField extends GenericField> =
	boolean | FieldUpdateAccess<TField>

/** Describes initial field input and every later value transition. */
export interface FieldWriteAccess<TField extends GenericField> {
	/**
	 * Controls a present field supplied through the actual create branch.
	 * @example `create: ({ value }) => value !== null`
	 */
	readonly create: AccessDecisionRule<
		FieldValueAccessInput<FieldHookTypes<TField>['create']>
	>
	/**
	 * Controls all updates together or through fill, replace, and clear.
	 * @example `update: { fill: true, replace: true, clear: false }`
	 */
	readonly update: FieldUpdateAccessDeclaration<TField>
}

/** Applies one boolean to every write or declares create and update separately. */
export type FieldWriteAccessDeclaration<TField extends GenericField> =
	boolean | FieldWriteAccess<TField>

/** Controls one field through its disclosure and value-transition boundaries. */
export interface FieldAccess<TField extends GenericField> {
	/**
	 * Controls output, where predicates, and ordering together or explicitly.
	 * @example `read: { output: true, where: false, orderBy: false }`
	 */
	readonly read?: FieldReadAccessDeclaration<TField>
	/**
	 * Controls every write together or through create and update transitions.
	 * @example `write: { create: true, update: { fill: true, replace: true, clear: false } }`
	 */
	readonly write?: FieldWriteAccessDeclaration<TField>
}

/** Contextually types inline field rules without retaining them in metadata. */
export interface FieldAccessDeclaration<TField extends GenericField> {
	/**
	 * Declares grouped read disclosure and write-transition decisions.
	 *
	 * @example `access: { read: { output: true, where: false, orderBy: false }, write: false }`
	 */
	readonly access?: FieldAccess<NoInfer<TField>>
}

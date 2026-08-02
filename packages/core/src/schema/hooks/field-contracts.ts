import type { MaybePromise } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type { InferFields } from '../inference/types.js'
import type {
	AnyValidationIssueCode,
	ValidationIssue,
} from '../plans/contracts.js'

/** Identifies the schema inference shape used by one field hook value. */
export type FieldHookMode = 'create' | 'object' | 'update'

type ReadPresentFieldValue<TFields> = TFields extends {
	readonly value?: infer TValue
}
	? 'value' extends keyof TFields
		? Exclude<TValue, undefined>
		: never
	: never

/** Infers a field value only when that operation mode can actually provide it. */
export type InferPresentFieldValue<
	TField extends GenericField,
	TMode extends FieldHookMode,
> = ReadPresentFieldValue<InferFields<{ readonly value: TField }, TMode>>

/** Gives reusable names to the exact values available to inline field hooks. */
export interface FieldHookTypes<TField extends GenericField> {
	/** The exact value accepted when this field is present in a create input. */
	readonly create: InferPresentFieldValue<TField, 'create'>
	/** The exact immutable value read from a persisted object. */
	readonly object: InferPresentFieldValue<TField, 'object'>
	/** The exact value accepted when this field is writable in an update. */
	readonly update: InferPresentFieldValue<TField, 'update'>
}

/** Represents absence without treating `undefined` as a logical field value. */
export type FieldValueState<TValue> =
	| Readonly<{
			/** Confirms that the field has a logical value. */
			present: true
			/** Carries the exact scalar, object, nullable, or listed value. */
			value: TValue
	  }>
	| Readonly<{
			/** Confirms that the field is genuinely absent. */
			present: false
	  }>

type PresentFieldValueState<TValue> = Extract<
	FieldValueState<TValue>,
	{ readonly present: true }
>
type AbsentFieldValueState<TValue> = Extract<
	FieldValueState<TValue>,
	{ readonly present: false }
>

/** Describes only real persisted transitions; absent-to-absent is impossible. */
export type FieldValueChange<TValue> =
	| Readonly<{
			readonly previous: AbsentFieldValueState<TValue>
			readonly current: PresentFieldValueState<TValue>
	  }>
	| Readonly<{
			readonly previous: PresentFieldValueState<TValue>
			readonly current: PresentFieldValueState<TValue>
	  }>
	| Readonly<{
			readonly previous: PresentFieldValueState<TValue>
			readonly current: AbsentFieldValueState<TValue>
	  }>

/** Groups terminals whose supplied values can pass through input hooks. */
export type FieldInputHookKind =
	| 'create-many'
	| 'create-one'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

/** Groups create terminals that run affected-field hooks in stable item order. */
export type FieldCreateHookKind = 'create-many' | 'create-one'

/** Set-based update never fabricates one field execution per matched row. */
export type FieldUpdateHookKind = 'update-one'

/** Groups upsert terminals whose individual items may resolve either branch. */
export type FieldUpsertHookKind = 'upsert-many' | 'upsert-one'

/** Set-based delete never loads rows merely to execute field hooks. */
export type FieldDeleteHookKind = 'delete-one'

/** Groups materialized create, update, and upsert field executions. */
export type FieldSaveHookKind =
	FieldCreateHookKind | FieldUpdateHookKind | FieldUpsertHookKind

/** Groups terminals that can return a selected logical field value. */
export type FieldOutputHookKind =
	| 'create-many'
	| 'create-one'
	| 'delete-one'
	| 'find'
	| 'first'
	| 'get'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

/** Supplies one present logical value without exposing sibling schema fields. */
export interface FieldValueHookInput<
	TValue,
	TKind extends OperationKind,
	TMode extends FieldHookMode,
> {
	/** Retains the normalized terminal as a concise discriminant. */
	readonly kind: TKind
	/** Distinguishes create and update branches, especially for an upsert. */
	readonly mode: TMode
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

type AvailableFieldHookInput<
	TValue,
	TKind extends OperationKind,
	TMode extends FieldHookMode,
> = [TValue] extends [never] ? never : FieldValueHookInput<TValue, TKind, TMode>

/** Correlates every input-producing terminal with its create or update value. */
export type FieldInputHookInput<TField extends GenericField> =
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['create'],
			FieldCreateHookKind,
			'create'
	  >
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['update'],
			FieldUpdateHookKind | 'update-many',
			'update'
	  >
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['create'],
			FieldUpsertHookKind,
			'create'
	  >
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['update'],
			FieldUpsertHookKind,
			'update'
	  >

/** Transforms a present input value before business validation. */
export type FieldResolveInputHook<TField extends GenericField> = <
	const TInput extends FieldInputHookInput<TField>,
>(
	input: TInput,
) => MaybePromise<TInput['value'] | undefined>

/** Uses the same structured validation issue format as schema validation. */
export type FieldHookValidationIssue = ValidationIssue<AnyValidationIssueCode>

/** Reports business issues for one present field value. */
export type FieldValidateHook<TField extends GenericField> = (
	input: FieldInputHookInput<TField>,
) => MaybePromise<readonly FieldHookValidationIssue[] | undefined>

type FieldEffectHook<TInput> = [TInput] extends [never]
	? never
	: (input: TInput) => MaybePromise<void>

type FieldCreateInput<TField extends GenericField> = AvailableFieldHookInput<
	FieldHookTypes<TField>['create'],
	FieldCreateHookKind,
	'create'
>

type FieldUpdateInput<TField extends GenericField> = AvailableFieldHookInput<
	FieldHookTypes<TField>['update'],
	FieldUpdateHookKind,
	'update'
>

type FieldUpsertInput<TField extends GenericField> =
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['create'],
			FieldUpsertHookKind,
			'create'
	  >
	| AvailableFieldHookInput<
			FieldHookTypes<TField>['update'],
			FieldUpsertHookKind,
			'update'
	  >

type FieldPersistedInput<
	TField extends GenericField,
	TKind extends OperationKind,
	TMode extends FieldHookMode,
> = FieldValueHookInput<FieldHookTypes<TField>['object'], TKind, TMode>

/** Runs before persistence for each present create value. */
export type FieldBeforeCreateHook<TField extends GenericField> =
	FieldEffectHook<FieldCreateInput<TField>>

/** Observes the materialized value produced by a create. */
export type FieldAfterCreateHook<TField extends GenericField> = FieldEffectHook<
	FieldPersistedInput<TField, FieldCreateHookKind, 'create'>
>

/** Runs only for materialized singular updates, never set-based update-many. */
export type FieldBeforeUpdateHook<TField extends GenericField> =
	FieldEffectHook<FieldUpdateInput<TField>>

/** Observes the materialized value produced by a singular update. */
export type FieldAfterUpdateHook<TField extends GenericField> = FieldEffectHook<
	FieldPersistedInput<TField, FieldUpdateHookKind, 'update'>
>

/** Runs for the candidate create or update value of each upsert item. */
export type FieldBeforeUpsertHook<TField extends GenericField> =
	FieldEffectHook<FieldUpsertInput<TField>>

/** Observes an upsert value after its atomic branch has been resolved. */
export type FieldAfterUpsertHook<TField extends GenericField> = FieldEffectHook<
	FieldPersistedInput<TField, FieldUpsertHookKind, 'create' | 'update'>
>

/** Observes a field before one materialized object is deleted. */
export type FieldBeforeDeleteHook<TField extends GenericField> =
	FieldEffectHook<FieldPersistedInput<TField, FieldDeleteHookKind, 'object'>>

/** Observes a field after one materialized object is deleted. */
export type FieldAfterDeleteHook<TField extends GenericField> = FieldEffectHook<
	FieldPersistedInput<TField, FieldDeleteHookKind, 'object'>
>

/** Reuses one handler across create, update, and upsert input values. */
export type FieldBeforeSaveHook<TField extends GenericField> = FieldEffectHook<
	FieldCreateInput<TField> | FieldUpdateInput<TField> | FieldUpsertInput<TField>
>

/** Reuses one handler across materialized create, update, and upsert values. */
export type FieldAfterSaveHook<TField extends GenericField> = FieldEffectHook<
	| FieldPersistedInput<TField, FieldCreateHookKind, 'create'>
	| FieldPersistedInput<TField, FieldUpdateHookKind, 'update'>
	| FieldPersistedInput<TField, FieldUpsertHookKind, 'create' | 'update'>
>

/** Transforms a permitted output without changing stored data or its logical type. */
export type FieldResolveOutputHook<TField extends GenericField> = (
	input: FieldPersistedInput<TField, FieldOutputHookKind, 'object'>,
) => MaybePromise<FieldHookTypes<TField>['object'] | undefined>

/** Describes one semantic persisted-value change before the outer commit. */
export interface FieldChangeHookInput<TField extends GenericField> {
	/** Excludes set-based update and delete because they do not materialize rows. */
	readonly kind: FieldSaveHookKind | FieldDeleteHookKind
	/** Makes the rollback-capable timing explicit to hook implementations. */
	readonly timing: 'before-commit'
	/** Distinguishes create, replacement, and a real unset without `undefined`. */
	readonly change: FieldValueChange<FieldHookTypes<TField>['object']>
}

/** Runs only when one materialized field value changes semantically. */
export type FieldOnChangeHook<TField extends GenericField> = FieldEffectHook<
	FieldChangeHookInput<TField>
>

/** Describes one successful change after its outer transaction commits. */
export interface FieldAfterCommitInput<TField extends GenericField> {
	readonly kind: FieldSaveHookKind | FieldDeleteHookKind
	readonly timing: 'after-commit'
	readonly change: FieldValueChange<FieldHookTypes<TField>['object']>
}

/** Runs only after the outer transaction commits successfully. */
export type FieldAfterCommitHook<TField extends GenericField> = FieldEffectHook<
	FieldAfterCommitInput<TField>
>

/** Describes a confirmed rollback without inventing a persisted field value. */
export interface FieldAfterRollbackInput {
	readonly error: unknown
	readonly kind: FieldSaveHookKind | FieldDeleteHookKind
	readonly timing: 'after-rollback'
}

/** Observes a confirmed rollback without replacing its original error. */
export type FieldAfterRollbackHook = FieldEffectHook<FieldAfterRollbackInput>

/** Describes one failed field-participating operation. */
export interface FieldErrorHookInput {
	readonly error: unknown
	readonly kind: FieldInputHookKind | FieldOutputHookKind
}

/** Observes a failure without replacing or suppressing it. */
export type FieldErrorHook = FieldEffectHook<FieldErrorHookInput>

/** Adds inline behavior while keeping callback declarations out of field metadata. */
export interface FieldHooks<TField extends GenericField> {
	/**
	 * Transforms a present create, update, or upsert value before validation.
	 *
	 * @example `resolveInput: ({ value }) => value.trim()`
	 */
	readonly resolveInput?: FieldResolveInputHook<TField>
	/**
	 * Returns immutable business issues for one present input value.
	 *
	 * @example `validate: ({ value }) => value.length === 0 ? [{ code: "custom", path: [], message: "Required" }] : []`
	 */
	readonly validate?: FieldValidateHook<TField>
	/** Runs before each present create value is persisted. */
	readonly beforeCreate?: FieldBeforeCreateHook<TField>
	/** Runs after each create value is materialized but before commit. */
	readonly afterCreate?: FieldAfterCreateHook<TField>
	/** Runs before a materialized singular update, never set-based update-many. */
	readonly beforeUpdate?: FieldBeforeUpdateHook<TField>
	/** Runs after a materialized singular update but before commit. */
	readonly afterUpdate?: FieldAfterUpdateHook<TField>
	/** Runs before each upsert item using its candidate create or update value. */
	readonly beforeUpsert?: FieldBeforeUpsertHook<TField>
	/** Runs after an upsert atomically resolves its create or update branch. */
	readonly afterUpsert?: FieldAfterUpsertHook<TField>
	/** Runs before a materialized singular delete, never set-based delete-many. */
	readonly beforeDelete?: FieldBeforeDeleteHook<TField>
	/** Runs after a materialized singular delete but before commit. */
	readonly afterDelete?: FieldAfterDeleteHook<TField>
	/** Reuses one handler before create, update, and upsert persistence. */
	readonly beforeSave?: FieldBeforeSaveHook<TField>
	/** Reuses one handler after create, update, and upsert persistence. */
	readonly afterSave?: FieldAfterSaveHook<TField>
	/**
	 * Transforms an access-approved output without changing stored data.
	 *
	 * @example `resolveOutput: ({ value }) => value.trim()`
	 */
	readonly resolveOutput?: FieldResolveOutputHook<TField>
	/** Runs before commit only when the persisted value changes semantically. */
	readonly onChange?: FieldOnChangeHook<TField>
	/** Runs after commit for a successfully persisted semantic change. */
	readonly afterCommit?: FieldAfterCommitHook<TField>
	/** Runs only after the adapter confirms rollback. */
	readonly afterRollback?: FieldAfterRollbackHook
	/** Observes a field-participating failure without suppressing it. */
	readonly onError?: FieldErrorHook
}

/** Contextually types hooks from the completed field without exposing them in metadata. */
export interface FieldHookDeclaration<TField extends GenericField> {
	/**
	 * Declares value-focused behavior for this field only.
	 *
	 * Use schema hooks when a rule needs sibling field values.
	 *
	 * @example `hooks: { resolveInput: ({ value }) => value.trim() }`
	 */
	readonly hooks?: FieldHooks<NoInfer<TField>>
}

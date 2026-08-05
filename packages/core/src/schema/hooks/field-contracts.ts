import type { MaybePromise } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import type { InferFields } from '../inference/types.js'
import type { HookContext } from './hook-context.js'
import type {
	HookErrorPhase,
	HookErrorTransactionState,
	HookHandlerDeclaration,
	HookValidationIssue,
	MutationHookFamily,
	OperationHookFamily,
	SaveHookFamily,
} from './contracts.js'

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

/** Groups supplied update values, including one set-based update expression. */
export type FieldUpdateInputHookKind = Extract<
	FieldInputHookKind,
	'update-many' | 'update-one'
>

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

/** Groups read terminals that can resolve one selected field value. */
export type FieldFindHookKind = Extract<
	FieldOutputHookKind,
	'find' | 'first' | 'get'
>

/** Groups materialized mutations that can execute value-focused field hooks. */
export type FieldMutationHookKind = FieldDeleteHookKind | FieldSaveHookKind

/** Supplies one present logical value without exposing sibling schema fields. */
export interface FieldValueHookInput<
	TValue,
	TKind extends OperationKind,
	TMode extends FieldHookMode,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
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

type FieldInputForKind<
	TField extends GenericField,
	TKind extends FieldInputHookKind,
> = Extract<FieldInputHookInput<TField>, { readonly kind: TKind }>

/** Transforms one compatible input family before business validation. */
export type FieldResolveInputFamilyHook<
	TField extends GenericField,
	TKind extends FieldInputHookKind,
> = <const TInput extends FieldInputForKind<TField, TKind>>(
	input: TInput,
) => MaybePromise<TInput['value'] | undefined>

/** Transforms a present input value before business validation. */
export type FieldResolveInputHook<TField extends GenericField> =
	FieldResolveInputFamilyHook<TField, FieldInputHookKind>

/** Uses the same structured validation issue format as schema validation. */
export type FieldHookValidationIssue = HookValidationIssue

/** Reports business issues for one present field value. */
export type FieldValidateFamilyHook<
	TField extends GenericField,
	TKind extends FieldInputHookKind,
> = (
	input: FieldInputForKind<TField, TKind>,
) => MaybePromise<readonly FieldHookValidationIssue[] | undefined>

/** Reports business issues for one present field value. */
export type FieldValidateHook<TField extends GenericField> =
	FieldValidateFamilyHook<TField, FieldInputHookKind>

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

/** Transforms one compatible output family without changing stored data. */
export type FieldResolveOutputFamilyHook<
	TField extends GenericField,
	TKind extends FieldOutputHookKind,
> = (
	input: FieldPersistedInput<TField, TKind, 'object'>,
) => MaybePromise<FieldHookTypes<TField>['object'] | undefined>

/** Transforms a permitted output without changing stored data or its logical type. */
export type FieldResolveOutputHook<TField extends GenericField> =
	FieldResolveOutputFamilyHook<TField, FieldOutputHookKind>

/** Describes one semantic persisted-value change before the outer commit. */
export interface FieldChangeHookInput<
	TField extends GenericField,
	TKind extends FieldMutationHookKind = FieldMutationHookKind,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Identifies the exact materialized object whose field value changed. */
	readonly itemId: string
	/** Excludes set-based update and delete because they do not materialize rows. */
	readonly kind: TKind
	/** Makes the rollback-capable timing explicit to hook implementations. */
	readonly timing: 'before-commit'
	/** Distinguishes lifecycle absence from a present logical value without `undefined`. */
	readonly change: FieldValueChange<FieldHookTypes<TField>['object']>
}

/** Runs only when one materialized field value changes semantically. */
export type FieldOnChangeHook<TField extends GenericField> = FieldEffectHook<
	FieldChangeHookInput<TField>
>

/** Observes semantic changes for one compatible mutation family. */
export type FieldOnChangeFamilyHook<
	TField extends GenericField,
	TKind extends FieldMutationHookKind,
> = FieldEffectHook<FieldChangeHookInput<TField, TKind>>

/** Describes one successful change after its outer transaction commits. */
export interface FieldAfterCommitInput<
	TField extends GenericField,
	TKind extends FieldMutationHookKind = FieldMutationHookKind,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Identifies the exact committed object whose field value changed. */
	readonly itemId: string
	readonly kind: TKind
	readonly timing: 'after-commit'
	readonly change: FieldValueChange<FieldHookTypes<TField>['object']>
}

/** Runs only after the outer transaction commits successfully. */
export type FieldAfterCommitHook<TField extends GenericField> = FieldEffectHook<
	FieldAfterCommitInput<TField>
>

/** Observes committed changes for one compatible mutation family. */
export type FieldAfterCommitFamilyHook<
	TField extends GenericField,
	TKind extends FieldMutationHookKind,
> = FieldEffectHook<FieldAfterCommitInput<TField, TKind>>

/** Describes a confirmed rollback without inventing a persisted field value. */
export interface FieldAfterRollbackInput<
	TKind extends FieldMutationHookKind = FieldMutationHookKind,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	readonly error: unknown
	readonly kind: TKind
	readonly timing: 'after-rollback'
}

/** Observes a confirmed rollback without replacing its original error. */
export type FieldAfterRollbackHook = FieldEffectHook<FieldAfterRollbackInput>

/** Observes rollbacks for one compatible mutation family. */
export type FieldAfterRollbackFamilyHook<TKind extends FieldMutationHookKind> =
	FieldEffectHook<FieldAfterRollbackInput<TKind>>

/** Describes one failed field-participating operation. */
export interface FieldErrorHookInput<
	TKind extends FieldInputHookKind | FieldOutputHookKind =
		FieldInputHookKind | FieldOutputHookKind,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** The original failure retained as an unknown boundary value. */
	readonly error: unknown
	/** The exact terminal discriminant for the field-participating operation. */
	readonly kind: TKind
	/** The stable lifecycle boundary where the original failure began. */
	readonly phase: HookErrorPhase
	/** The final transaction and rollback outcome known to this observer. */
	readonly transaction: HookErrorTransactionState
}

/** Observes a failure without replacing or suppressing it. */
export type FieldErrorHook<
	TKind extends FieldInputHookKind | FieldOutputHookKind =
		FieldInputHookKind | FieldOutputHookKind,
> = FieldEffectHook<FieldErrorHookInput<TKind>>

/** Declares field input resolution directly, as a list, or by save family. */
export type FieldResolveInputHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldResolveInputHook<TField>>
	| SaveHookFamily<
			FieldResolveInputHook<TField>,
			FieldResolveInputFamilyHook<TField, FieldCreateHookKind>,
			FieldResolveInputFamilyHook<TField, FieldUpdateInputHookKind>,
			FieldResolveInputFamilyHook<TField, FieldUpsertHookKind>
	  >

/** Declares field validation directly, as a list, or by save family. */
export type FieldValidateHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldValidateHook<TField>>
	| SaveHookFamily<
			FieldValidateHook<TField>,
			FieldValidateFamilyHook<TField, FieldCreateHookKind>,
			FieldValidateFamilyHook<TField, FieldUpdateInputHookKind>,
			FieldValidateFamilyHook<TField, FieldUpsertHookKind>
	  >

/** Declares before-save effects directly, as a list, or by save family. */
export type FieldBeforeSaveHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldBeforeSaveHook<TField>>
	| SaveHookFamily<
			FieldBeforeSaveHook<TField>,
			FieldBeforeCreateHook<TField>,
			FieldBeforeUpdateHook<TField>,
			FieldBeforeUpsertHook<TField>
	  >

/** Declares after-save effects directly, as a list, or by save family. */
export type FieldAfterSaveHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldAfterSaveHook<TField>>
	| SaveHookFamily<
			FieldAfterSaveHook<TField>,
			FieldAfterCreateHook<TField>,
			FieldAfterUpdateHook<TField>,
			FieldAfterUpsertHook<TField>
	  >

/** Declares output resolution directly, as a list, or by operation family. */
export type FieldResolveOutputHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldResolveOutputHook<TField>>
	| OperationHookFamily<
			FieldResolveOutputHook<TField>,
			FieldResolveOutputFamilyHook<TField, FieldCreateHookKind>,
			FieldResolveOutputFamilyHook<TField, FieldUpdateHookKind>,
			FieldResolveOutputFamilyHook<TField, FieldUpsertHookKind>,
			FieldResolveOutputFamilyHook<TField, FieldDeleteHookKind>,
			FieldResolveOutputFamilyHook<TField, FieldFindHookKind>
	  >

/** Declares change effects directly, as a list, or by mutation family. */
export type FieldOnChangeHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldOnChangeHook<TField>>
	| MutationHookFamily<
			FieldOnChangeHook<TField>,
			FieldOnChangeFamilyHook<TField, FieldCreateHookKind>,
			FieldOnChangeFamilyHook<TField, FieldUpdateHookKind>,
			FieldOnChangeFamilyHook<TField, FieldUpsertHookKind>,
			FieldOnChangeFamilyHook<TField, FieldDeleteHookKind>
	  >

/** Declares post-commit effects directly, as a list, or by mutation family. */
export type FieldAfterCommitHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldAfterCommitHook<TField>>
	| MutationHookFamily<
			FieldAfterCommitHook<TField>,
			FieldAfterCommitFamilyHook<TField, FieldCreateHookKind>,
			FieldAfterCommitFamilyHook<TField, FieldUpdateHookKind>,
			FieldAfterCommitFamilyHook<TField, FieldUpsertHookKind>,
			FieldAfterCommitFamilyHook<TField, FieldDeleteHookKind>
	  >

/** Declares rollback effects directly, as a list, or by mutation family. */
export type FieldAfterRollbackHookDeclaration =
	| HookHandlerDeclaration<FieldAfterRollbackHook>
	| MutationHookFamily<
			FieldAfterRollbackHook,
			FieldAfterRollbackFamilyHook<FieldCreateHookKind>,
			FieldAfterRollbackFamilyHook<FieldUpdateHookKind>,
			FieldAfterRollbackFamilyHook<FieldUpsertHookKind>,
			FieldAfterRollbackFamilyHook<FieldDeleteHookKind>
	  >

/** Declares error effects directly, as a list, or by operation family. */
export type FieldErrorHookDeclaration =
	| HookHandlerDeclaration<FieldErrorHook>
	| OperationHookFamily<
			FieldErrorHook,
			FieldErrorHook<FieldCreateHookKind>,
			FieldErrorHook<FieldUpdateInputHookKind>,
			FieldErrorHook<FieldUpsertHookKind>,
			FieldErrorHook<FieldDeleteHookKind>,
			FieldErrorHook<FieldFindHookKind>
	  >

/** Declares one exact field phase handler or a non-empty ordered list. */
type FieldExactHookDeclaration<THandler> = HookHandlerDeclaration<THandler>

/**
 * Adds composable inline behavior while keeping callbacks out of field metadata.
 *
 * Direct handlers and non-empty lists work for every phase. Broad phases also
 * accept compatible family maps without widening this field's logical value.
 */
export interface FieldHooks<TField extends GenericField> {
	/**
	 * Transforms a present create, update, or upsert value before validation.
	 *
	 * @example `resolveInput: ({ value }) => value.trim()`
	 */
	readonly resolveInput?: FieldResolveInputHookDeclaration<TField>
	/**
	 * Returns immutable business issues for one present input value.
	 *
	 * @example `validate: ({ value }) => value.length === 0 ? [{ code: "hook.required", path: [], message: "Required" }] : []`
	 */
	readonly validate?: FieldValidateHookDeclaration<TField>
	/** Runs before each present create value is persisted. */
	readonly beforeCreate?: FieldExactHookDeclaration<
		FieldBeforeCreateHook<TField>
	>
	/** Runs after each create value is materialized but before commit. */
	readonly afterCreate?: FieldExactHookDeclaration<FieldAfterCreateHook<TField>>
	/** Runs before a materialized singular update, never set-based update-many. */
	readonly beforeUpdate?: FieldExactHookDeclaration<
		FieldBeforeUpdateHook<TField>
	>
	/** Runs after a materialized singular update but before commit. */
	readonly afterUpdate?: FieldExactHookDeclaration<FieldAfterUpdateHook<TField>>
	/** Runs before each upsert item using its candidate create or update value. */
	readonly beforeUpsert?: FieldExactHookDeclaration<
		FieldBeforeUpsertHook<TField>
	>
	/** Runs after an upsert atomically resolves its create or update branch. */
	readonly afterUpsert?: FieldExactHookDeclaration<FieldAfterUpsertHook<TField>>
	/** Runs before a materialized singular delete, never set-based delete-many. */
	readonly beforeDelete?: FieldExactHookDeclaration<
		FieldBeforeDeleteHook<TField>
	>
	/** Runs after a materialized singular delete but before commit. */
	readonly afterDelete?: FieldExactHookDeclaration<FieldAfterDeleteHook<TField>>
	/** Reuses one handler before create, update, and upsert persistence. */
	readonly beforeSave?: FieldBeforeSaveHookDeclaration<TField>
	/** Reuses one handler after create, update, and upsert persistence. */
	readonly afterSave?: FieldAfterSaveHookDeclaration<TField>
	/**
	 * Transforms an access-approved output without changing stored data.
	 *
	 * @example `resolveOutput: ({ value }) => value.trim()`
	 */
	readonly resolveOutput?: FieldResolveOutputHookDeclaration<TField>
	/** Runs before commit only when the persisted value changes semantically. */
	readonly onChange?: FieldOnChangeHookDeclaration<TField>
	/** Runs after commit for a successfully persisted semantic change. */
	readonly afterCommit?: FieldAfterCommitHookDeclaration<TField>
	/** Runs only after the adapter confirms rollback. */
	readonly afterRollback?: FieldAfterRollbackHookDeclaration
	/** Observes a field-participating failure without suppressing it. */
	readonly onError?: FieldErrorHookDeclaration
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

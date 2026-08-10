import type { MaybePromise } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { FieldValueMap } from '../fields/base/value-map.js'
import type { HookContext } from './hook-context.js'
import type {
	HookHandlerDeclaration,
	SaveHookFamily,
	SchemaMutationKind,
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
export type PresentFieldValue<
	TField extends GenericField,
	TMode extends FieldHookMode,
> = string extends TField['kind']
	? unknown
	: ReadPresentFieldValue<FieldValueMap<{ readonly value: TField }, TMode>>

/** Gives reusable names to the exact values available to inline field hooks. */
export interface FieldHookTypes<TField extends GenericField> {
	/** The exact value accepted when this field is present in a create input. */
	readonly create: PresentFieldValue<TField, 'create'>
	/** The exact immutable value read from a persisted object. */
	readonly object: PresentFieldValue<TField, 'object'>
	/** The exact value accepted when this field is writable in an update. */
	readonly update: PresentFieldValue<TField, 'update'>
}

/** Groups terminals whose supplied values can pass through input hooks. */
export type FieldInputHookKind = Extract<
	SchemaMutationKind,
	'create' | 'update' | 'upsert'
>

/** Identifies supplied values from one itemized update operation. */
export type FieldUpdateInputHookKind = Extract<FieldInputHookKind, 'update'>

/** Identifies singular update values retained by field Access and output traversal. */
export type FieldUpdateHookKind = 'update'

/** Groups create terminals whose supplied values can be resolved in stable order. */
export type FieldCreateHookKind = 'create'

/** Groups upsert terminals whose supplied values retain their candidate branch. */
export type FieldUpsertHookKind = 'upsert'

/** Groups terminals that can expose selected logical field values. */
export type FieldOutputHookKind =
	| 'create-many'
	| 'create-one'
	| 'delete-many'
	| 'delete-one'
	| 'find-many'
	| 'find-one'
	| 'get'
	| 'update-many'
	| 'update-one'
	| 'upsert-many'
	| 'upsert-one'

/** Supplies one present logical value without exposing sibling schema fields. */
export interface FieldValueHookInput<
	TValue,
	TKind extends FieldInputHookKind,
	TMode extends FieldHookMode,
> {
	/** Carries immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Identifies the item-oriented mutation independently from cardinality. */
	readonly kind: TKind
	/** Distinguishes create and update branches, especially for an upsert. */
	readonly mode: TMode
	/** Carries only this field's exact logical value. */
	readonly value: TValue
}

type AvailableFieldHookInput<
	TValue,
	TKind extends FieldInputHookKind,
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
			FieldUpdateHookKind,
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

/** Declares field input resolution directly, as a list, or by save family. */
export type FieldResolveInputHookDeclaration<TField extends GenericField> =
	| HookHandlerDeclaration<FieldResolveInputHook<TField>>
	| SaveHookFamily<
			FieldResolveInputHook<TField>,
			FieldResolveInputFamilyHook<TField, FieldCreateHookKind>,
			FieldResolveInputFamilyHook<TField, FieldUpdateInputHookKind>,
			FieldResolveInputFamilyHook<TField, FieldUpsertHookKind>
	  >

/**
 * Resolves one field's present input without mixing object lifecycle effects
 * into reusable field declarations.
 */
export interface FieldHooks<TField extends GenericField> {
	/**
	 * Transforms a present create, update, or upsert value before validation.
	 *
	 * @example `resolveInput: ({ value }) => value.trim()`
	 */
	readonly resolveInput?: FieldResolveInputHookDeclaration<TField>
}

/** Contextually types hooks from the completed field without exposing them in metadata. */
export interface FieldHookDeclaration<TField extends GenericField> {
	/**
	 * Declares input normalization or rejection for this field only.
	 *
	 * Use schema hooks for business validation and operation lifecycle effects.
	 *
	 * @example `hooks: { resolveInput: ({ value }) => value.trim() }`
	 */
	readonly hooks?: FieldHooks<NoInfer<TField>>
}

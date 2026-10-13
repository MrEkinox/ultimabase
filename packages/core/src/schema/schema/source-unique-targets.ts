import type {
	FieldList,
	FieldTypeStateOf,
	FieldValue,
	GenericField,
	IsUniqueField,
} from '../fields/base/contract.js'
import type { EqualityFieldKind } from '../fields/base/filter-kinds.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { PointerTarget } from '../relations/pointer.js'
import type { SchemaTypeInfoFor } from '../type-info.js'
import type { SchemaDeclaredFields } from './definition.js'
import type { SourceFieldObjectValue, SourceListItem } from './source-fields.js'
import type { SystemFields } from './system-fields.js'

/** The field list of one unique index, in declaration order. */
export type UniqueIndexFields = readonly [string, ...string[]]

/**
 * Reads the field lists of the unique indexes declared in
 * `define({ indexes })` without `where`: each one is a unique target
 * (ADR-0332). A partial unique index identifies no row in general.
 */
export type DeclaredUniqueIndexFields<TIndexes> =
	TIndexes extends readonly (infer TIndex)[]
		? TIndex extends {
				readonly fields: infer TFields extends UniqueIndexFields
				readonly unique: true
			}
			? TIndex extends { readonly where: object }
				? never
				: TFields
			: never
		: never

/**
 * One equality of a unique target, in the shorthand and `{ eq }` forms of the
 * filter equality (ADR-0307), never `null`.
 */
type UniqueTargetValue<TField> =
	TField extends PointerField<infer TTarget>
		? | string
			| PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
			| { readonly eq: string }
		: TField extends GenericField
			? FieldTypeStateOf<TField>['list'] extends FieldList
				? { readonly eq: readonly SourceListItem<TField>[] }
				: TField['kind'] extends Exclude<EqualityFieldKind, 'json' | 'pointer'>
					? | NonNullable<FieldValue<TField>>
						| { readonly eq: NonNullable<FieldValue<TField>> }
					: { readonly eq: NonNullable<SourceFieldObjectValue<TField>> }
			: never

type UniqueFieldName<TFields extends SchemaDeclaredFields> = UniqueFieldKey<
	TFields,
	keyof TFields
>

// Distributes over the declared names; system fields are never `unique`.
type UniqueFieldKey<TFields, TKey> = TKey extends keyof TFields & string
	? IsUniqueField<TFields[TKey]> extends true
		? TKey
		: never
	: never

/** Every key set Runtime accepts: `id`, each unique field, each unique index. */
type UniqueKeySet<
	TFields extends SchemaDeclaredFields,
	TUniqueIndexes extends UniqueIndexFields,
> =
	| readonly ['id']
	| (UniqueFieldName<TFields> extends infer TName extends string
			? TName extends unknown
				? readonly [TName]
				: never
			: never)
	| TUniqueIndexes

type UniqueTargetLabel<TKeys extends readonly string[]> =
	TKeys extends readonly [infer THead extends string]
		? THead
		: TKeys extends readonly [
					infer THead extends string,
					...infer TRest extends readonly string[],
			  ]
			? `${THead}, ${UniqueTargetLabel<TRest>}`
			: never

// `id` and the other system fields are read without building the stored map.
type UniqueKeyValue<
	TFields extends SchemaDeclaredFields,
	TKey extends string,
> = TKey extends 'id'
	? string | { readonly eq: string }
	: TKey extends keyof TFields
		? UniqueTargetValue<TFields[TKey]>
		: TKey extends keyof SystemFields
			? UniqueTargetValue<SystemFields[TKey]>
			: never

/**
 * One target: every field of its key set, and no other unique key, since
 * Runtime refuses a target naming two key sets. The flattened object sits in
 * a conditional branch so that diagnostics print its fields, not an alias.
 */
type UniqueTarget<
	TFields extends SchemaDeclaredFields,
	TKeys extends string,
	TAllKeys extends string,
> = {
	readonly [TKey in TKeys]: UniqueKeyValue<TFields, TKey>
} & Readonly<
	Partial<Record<Exclude<TAllKeys, TKeys>, never>>
> extends infer TTarget
	? { readonly [TKey in keyof TTarget]: TTarget[TKey] }
	: never

/**
 * The unique targets of one schema, keyed by their field list: the members of
 * `UniqueWhereInput` (ADR-0332).
 */
export type SourceUniqueTargets<
	TFields extends SchemaDeclaredFields,
	TUniqueIndexes extends UniqueIndexFields,
> = UniqueTargetsOf<TFields, UniqueKeySet<TFields, TUniqueIndexes>>

type UniqueTargetsOf<
	TFields extends SchemaDeclaredFields,
	TKeySets extends readonly string[],
> = {
	readonly [TKeys in TKeySets as UniqueTargetLabel<TKeys>]: UniqueTarget<
		TFields,
		TKeys[number],
		TKeySets[number]
	>
}

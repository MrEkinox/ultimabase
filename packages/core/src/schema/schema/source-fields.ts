import type {
	FieldTypeStateOf,
	FieldValue,
	GenericField,
} from '../fields/base/contract.js'
import type { FieldValueMap } from '../fields/base/value-map.js'
import type { OrderableFieldKind } from '../fields/base/filter-kinds.js'
import type { OutputValue } from '../output/contracts.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { PointerLinkInput } from '../nested-writes/inputs.js'
import type { PointerTarget } from '../relations/pointer.js'
import type { SchemaTypeInfoFor } from '../type-info.js'
import type { SchemaDeclaredFields } from './definition.js'
import type { SystemFields } from './system-fields.js'
import type { GenericVirtualField } from './virtual-field.js'

export type Simplify<TValue> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
}

type DeveloperStoredSourceFields<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericVirtualField
			? never
			: TFields[TKey] extends GenericField
				? TKey
				: never
	]: TFields[TKey]
}

export type StoredSourceFields<TFields extends SchemaDeclaredFields> = Simplify<
	Omit<DeveloperStoredSourceFields<TFields>, keyof SystemFields> & SystemFields
>

export type VirtualSourceFields<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericVirtualField
			? TKey
			: never
	]: TFields[TKey]
}

export type SourceItem<TFields extends SchemaDeclaredFields> = Simplify<
	Omit<
		FieldValueMap<StoredSourceFields<TFields>, 'object'>,
		keyof SystemFields
	> &
		Readonly<{
			readonly createdAt: string
			readonly id: string
			readonly updatedAt: string
		}>
>

type SourceVirtualValues<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof VirtualSourceFields<TFields>
	]: VirtualSourceFields<TFields>[TKey] extends GenericVirtualField
		? OutputValue<VirtualSourceFields<TFields>[TKey]['output']>
		: never
}

export type SourceOutput<TFields extends SchemaDeclaredFields> = Simplify<
	SourceItem<TFields> & SourceVirtualValues<TFields>
>

type FieldIsPresent<
	TField,
	TMode extends 'create' | 'object' | 'update',
> = TField extends GenericField
	? FieldTypeStateOf<TField>[TMode] extends 'forbidden'
		? false
		: true
	: false

export type SourceSelectableFieldName<TFields extends SchemaDeclaredFields> =
	| {
			[TKey in keyof StoredSourceFields<TFields>]: FieldIsPresent<
				StoredSourceFields<TFields>[TKey],
				'object'
			> extends true
				? TKey
				: never
	  }[keyof StoredSourceFields<TFields>]
	| keyof VirtualSourceFields<TFields>

export type SourceSelect<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in Extract<SourceSelectableFieldName<TFields>, string>
	]?: TKey extends 'id' ? true : boolean
}>

export type SourceDependencySelect<TFields extends SchemaDeclaredFields> =
	Readonly<{
		[
			TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends {
				readonly kind: 'relation'
			}
				? never
				: TKey
		]?: TKey extends 'id' ? true : boolean
	}>

/** Non-list fields of Core's orderable kinds: what Runtime orders (ADR-0332). */
type IsOrderableSourceField<TField> = TField extends GenericField
	? TField['kind'] extends OrderableFieldKind
		? FieldTypeStateOf<TField>['list'] extends true
			? false
			: true
		: false
	: false

export type SourceOrderBy<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in keyof StoredSourceFields<TFields> as IsOrderableSourceField<
			StoredSourceFields<TFields>[TKey]
		> extends true
			? TKey
			: never
	]?: 'asc' | 'desc' | null
}>

export type SourceFieldObjectValue<TField extends GenericField> =
	FieldValueMap<
		Readonly<{ readonly value: TField }>,
		'object'
	> extends Readonly<{ readonly value: infer TValue }>
		? TValue
		: never

export type SourceFieldModeValue<
	TField extends GenericField,
	TMode extends 'create' | 'object' | 'update',
> =
	FieldValueMap<Readonly<{ readonly value: TField }>, TMode> extends Readonly<{
		readonly value?: infer TValue
	}>
		? TValue
		: never

type SourceMutationFieldValue<TField extends GenericField, TValue> =
	TField extends PointerField<infer TTarget>
		? | PointerLinkInput<
					string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
			  >
			| (FieldTypeStateOf<TField>['nullable'] extends true ? null : never)
		: TValue

/** Reuses Core presence rules while projecting pointer writes to `connect` links. */
export type SourceFieldValueMap<
	TFields extends SchemaDeclaredFields,
	TMode extends 'create' | 'update',
> = {
	[
		TKey in keyof FieldValueMap<StoredSourceFields<TFields>, TMode>
	]: TKey extends keyof StoredSourceFields<TFields>
		? SourceMutationFieldValue<
				StoredSourceFields<TFields>[TKey],
				FieldValueMap<StoredSourceFields<TFields>, TMode>[TKey]
			>
		: never
}

export type SourceListItem<TField extends GenericField> =
	FieldValue<TField> extends readonly (infer TValue)[] ? TValue : never

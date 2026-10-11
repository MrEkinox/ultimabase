import type {
	FieldTypegenStateOf,
	FieldUpdateInput,
	FieldList,
	FieldListValue,
	FieldValue,
	GenericField,
} from './contract.js'
import type { SchemaFields } from '../../schema/definition.js'

export type FieldValueMode = 'object' | 'create' | 'update'

/** Materializes mapped intersections so editor QuickInfo exposes final properties. */
type Simplify<TValue> = {
	[TKey in keyof TValue]: TValue[TKey]
} & {}

type HasNullableValidation<TField> = FieldTypegenStateOf<TField>['nullable']

type IsListField<TField> = FieldTypegenStateOf<TField>['list'] extends FieldList
	? true
	: false

type ObjectChildMode<
	TField,
	TMode extends FieldValueMode,
> = TMode extends 'update'
	? IsListField<TField> extends true
		? 'create'
		: 'update'
	: TMode

type IsCreateRequired<TField> =
	FieldTypegenStateOf<TField>['create'] extends 'required' ? true : false

type BaseFieldValue<
	TField extends GenericField,
	TMode extends FieldValueMode,
> = TField extends {
	readonly kind: 'object'
	readonly options: {
		readonly fields: infer TFields extends SchemaFields
	}
}
	? FieldListValue<
			FieldValueMap<TFields, ObjectChildMode<TField, TMode>>,
			FieldTypegenStateOf<TField>['list']
		>
	: FieldValue<TField>

type ResolvedFieldValue<
	TField extends GenericField,
	TMode extends FieldValueMode,
> =
	HasNullableValidation<TField> extends true
		? BaseFieldValue<TField, TMode> | null
		: BaseFieldValue<TField, TMode>

type IsOmittedField<
	TField extends GenericField,
	TMode extends FieldValueMode,
> = FieldTypegenStateOf<TField>[TMode] extends 'forbidden' ? true : false

type ObjectRequiredFields<TFields extends SchemaFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'object'> extends true
				? never
				: TKey
			: never
	]-?: TFields[TKey] extends GenericField
		? ResolvedFieldValue<TFields[TKey], 'object'>
		: never
}

type CreateRequiredFields<TFields extends SchemaFields> = {
	-readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'create'> extends true
				? never
				: IsCreateRequired<TFields[TKey]> extends true
					? TKey
					: never
			: never
	]-?: TFields[TKey] extends GenericField
		? ResolvedFieldValue<TFields[TKey], 'create'>
		: never
}

type CreateOptionalFields<TFields extends SchemaFields> = {
	-readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'create'> extends true
				? never
				: IsCreateRequired<TFields[TKey]> extends true
					? never
					: TKey
			: never
	]?: TFields[TKey] extends GenericField
		? ResolvedFieldValue<TFields[TKey], 'create'>
		: never
}

type UpdateFields<TFields extends SchemaFields> = {
	-readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'update'> extends true
				? never
				: TKey
			: never
	]?: TFields[TKey] extends GenericField
		?
				| ResolvedFieldValue<TFields[TKey], 'update'>
				| FieldUpdateInput<TFields[TKey]>
		: never
}

export type FieldValueMap<
	TFields extends SchemaFields,
	TMode extends FieldValueMode,
> = TMode extends 'object'
	? Simplify<ObjectRequiredFields<TFields>>
	: TMode extends 'create'
		? Simplify<CreateRequiredFields<TFields> & CreateOptionalFields<TFields>>
		: Simplify<UpdateFields<TFields>>

import type {
	FieldInferenceStateOf,
	FieldList,
	FieldListValue,
	FieldValue,
	GenericField,
} from '../fields/base/contract.js'
import type { SchemaFields } from '../schema/definition.js'

export type InferenceMode = 'object' | 'create' | 'update'

/** Materializes mapped intersections so editor QuickInfo exposes final properties. */
type Simplify<TValue> = {
	[TKey in keyof TValue]: TValue[TKey]
} & {}

type HasNullableValidation<TField> = FieldInferenceStateOf<TField>['nullable']

type IsListField<TField> =
	FieldInferenceStateOf<TField>['list'] extends FieldList ? true : false

type ObjectChildMode<
	TField,
	TMode extends InferenceMode,
> = TMode extends 'update'
	? IsListField<TField> extends true
		? 'create'
		: 'update'
	: TMode

type IsCreateRequired<TField> =
	FieldInferenceStateOf<TField>['create'] extends 'required' ? true : false

type BaseFieldValue<
	TField extends GenericField,
	TMode extends InferenceMode,
> = TField extends {
	readonly kind: 'object'
	readonly options: {
		readonly fields: infer TFields extends SchemaFields
	}
}
	? FieldListValue<
			InferFields<TFields, ObjectChildMode<TField, TMode>>,
			FieldInferenceStateOf<TField>['list']
		>
	: FieldValue<TField>

type InferFieldValue<TField extends GenericField, TMode extends InferenceMode> =
	HasNullableValidation<TField> extends true
		? BaseFieldValue<TField, TMode> | null
		: BaseFieldValue<TField, TMode>

type IsOmittedField<
	TField extends GenericField,
	TMode extends InferenceMode,
> = FieldInferenceStateOf<TField>[TMode] extends 'forbidden' ? true : false

type ObjectRequiredFields<TFields extends SchemaFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'object'> extends true
				? never
				: TKey
			: never
	]-?: TFields[TKey] extends GenericField
		? InferFieldValue<TFields[TKey], 'object'>
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
		? InferFieldValue<TFields[TKey], 'create'>
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
		? InferFieldValue<TFields[TKey], 'create'>
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
		? InferFieldValue<TFields[TKey], 'update'>
		: never
}

export type InferFields<
	TFields extends SchemaFields,
	TMode extends InferenceMode,
> = TMode extends 'object'
	? Simplify<ObjectRequiredFields<TFields>>
	: TMode extends 'create'
		? Simplify<CreateRequiredFields<TFields> & CreateOptionalFields<TFields>>
		: Simplify<UpdateFields<TFields>>

/**
 * Describes the common structural boundary accepted by public inference helpers.
 */
interface InferableSchema {
	readonly fields: SchemaFields
}

/**
 * Infers the persisted object shape returned by UltimaBase.
 */
export type InferObject<TSchema extends InferableSchema> = InferFields<
	TSchema['fields'],
	'object'
>

/**
 * Infers developer-supplied values accepted when creating an object.
 */
export type InferCreateInput<TSchema extends InferableSchema> = InferFields<
	TSchema['fields'],
	'create'
>

/**
 * Infers developer-supplied values accepted when updating an object.
 */
export type InferUpdateInput<TSchema extends InferableSchema> = InferFields<
	TSchema['fields'],
	'update'
>

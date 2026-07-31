import type { FieldExtension, FieldExtensionInference } from './extension.js'
import type { FieldOptionsValue, FieldValue, GenericField } from './field.js'
import type { SchemaFields } from './schema.js'

type InferenceMode = 'object' | 'create' | 'update'

type Simplify<TValue> = {
	[TKey in keyof TValue]: TValue[TKey]
}

type FieldOptionsOf<TField> = TField extends {
	readonly options: infer TOptions extends object
}
	? TOptions
	: object

type FieldExtensionsOf<TField> =
	FieldOptionsOf<TField> extends {
		readonly extensions: infer TExtensions extends readonly FieldExtension<
			string,
			object
		>[]
	}
		? TExtensions
		: readonly []

type HasRequiredValidation<TField> =
	FieldOptionsOf<TField> extends {
		readonly validation: { readonly required: true }
	}
		? true
		: false

type HasNullableValidation<TField> =
	FieldOptionsOf<TField> extends {
		readonly validation: { readonly nullable: true }
	}
		? true
		: false

type HasDefault<TField> =
	FieldOptionsOf<TField> extends {
		readonly default: unknown
	}
		? true
		: false

type IsAutoIncremented<TField> =
	FieldOptionsOf<TField> extends {
		readonly autoIncrement: true
	}
		? true
		: false

type IsGenerated<TField> =
	FieldOptionsOf<TField> extends {
		readonly generatedOn: unknown
	}
		? true
		: false

type IsImmutable<TField> =
	FieldOptionsOf<TField> extends {
		readonly immutable: true
	}
		? true
		: false

type IsOutputRequired<TField> =
	HasRequiredValidation<TField> extends true
		? true
		: HasDefault<TField> extends true
			? true
			: IsAutoIncremented<TField> extends true
				? true
				: IsGenerated<TField> extends true
					? true
					: false

type IsCreateRequired<TField> =
	HasRequiredValidation<TField> extends true
		? HasDefault<TField> extends true
			? false
			: IsAutoIncremented<TField> extends true
				? false
				: true
		: false

type ApplyInferenceOverride<TValue, TInference, TMode extends InferenceMode> =
	TInference extends Readonly<Record<TMode, infer TOverride>>
		? TOverride
		: TValue

type ApplyFieldExtensions<
	TValue,
	TExtensions,
	TMode extends InferenceMode,
> = TExtensions extends readonly [
	infer TExtension,
	...infer TRest extends readonly unknown[],
]
	? ApplyFieldExtensions<
			ApplyInferenceOverride<
				TValue,
				FieldExtensionInference<TExtension>,
				TMode
			>,
			TRest,
			TMode
		>
	: TValue

type BaseFieldValue<
	TField extends GenericField,
	TMode extends InferenceMode,
> = TField extends {
	readonly kind: 'object'
	readonly options: {
		readonly fields: infer TFields extends SchemaFields
	}
}
	? FieldOptionsValue<InferFields<TFields, TMode>, FieldOptionsOf<TField>>
	: FieldValue<TField>

type InferNonNullableFieldValue<
	TField extends GenericField,
	TMode extends InferenceMode,
> = ApplyFieldExtensions<
	BaseFieldValue<TField, TMode>,
	FieldExtensionsOf<TField>,
	TMode
>

type InferFieldValue<
	TField extends GenericField,
	TMode extends InferenceMode,
> = [InferNonNullableFieldValue<TField, TMode>] extends [never]
	? never
	: HasNullableValidation<TField> extends true
		? InferNonNullableFieldValue<TField, TMode> | null
		: InferNonNullableFieldValue<TField, TMode>

type IsOmittedField<
	TField extends GenericField,
	TMode extends InferenceMode,
> = [InferFieldValue<TField, TMode>] extends [never]
	? true
	: TMode extends 'create'
		? IsGenerated<TField>
		: TMode extends 'update'
			? IsGenerated<TField> extends true
				? true
				: IsImmutable<TField>
			: false

type ObjectRequiredFields<TFields extends SchemaFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'object'> extends true
				? never
				: IsOutputRequired<TFields[TKey]> extends true
					? TKey
					: never
			: never
	]-?: TFields[TKey] extends GenericField
		? InferFieldValue<TFields[TKey], 'object'>
		: never
}

type ObjectOptionalFields<TFields extends SchemaFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericField
			? IsOmittedField<TFields[TKey], 'object'> extends true
				? never
				: IsOutputRequired<TFields[TKey]> extends true
					? never
					: TKey
			: never
	]?: TFields[TKey] extends GenericField
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

type InferFields<
	TFields extends SchemaFields,
	TMode extends InferenceMode,
> = TMode extends 'object'
	? Simplify<ObjectRequiredFields<TFields> & ObjectOptionalFields<TFields>>
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

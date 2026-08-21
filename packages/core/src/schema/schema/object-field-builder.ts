import type { FieldListOption } from '../fields/base/contract.js'
import type { FieldStandardSchema } from '../fields/base/standard-schema.js'
import type {
	DefaultedObjectField,
	DefaultedObjectFieldOptions,
	NonDefaultedObjectField,
	NonDefaultedObjectFieldOptions,
	ObjectFields,
} from '../fields/builtins/object.js'
import type { EmbeddedFieldBuilder } from './field-builder.js'

type DefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = Omit<
	DefaultedObjectFieldOptions<
		TFields,
		TRequired,
		TList,
		TImmutable,
		TValidation
	>,
	'fields'
> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

type NonDefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = Omit<
	NonDefaultedObjectFieldOptions<
		TFields,
		TRequired,
		TList,
		TImmutable,
		TValidation
	>,
	'fields'
> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

/** Preserves exact embedded fields and validator inference for FieldBuilder.object. */
export interface ObjectFieldBuilderMethod {
	<
		const TFields extends ObjectFields,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedObjectFieldBuilderOptions<
			TFields,
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedObjectField<TFields, TRequired, TList, TImmutable>
	<
		const TFields extends ObjectFields,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: NonDefaultedObjectFieldBuilderOptions<
			TFields,
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>
}

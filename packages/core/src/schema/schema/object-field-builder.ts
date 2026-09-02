import type {
	CompatibleFieldOptionsExtension,
	FieldListOption,
} from '../fields/base/contract.js'
import type {
	DefaultedObjectField,
	DefaultedObjectFieldOptions,
	NonDefaultedObjectField,
	NonDefaultedObjectFieldOptions,
	ObjectFields,
	ObjectFieldValue,
} from '../fields/builtins/object.js'
import type { EmbeddedFieldBuilder } from './field-builder.js'

type DefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = Omit<
	DefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
	'fields'
> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

type NonDefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = Omit<
	NonDefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
	'fields'
> & {
	readonly fields: (field: EmbeddedFieldBuilder) => TFields
}

/** Preserves exact embedded fields and generated options for FieldBuilder.object. */
export interface ObjectFieldBuilderMethod {
	<
		const TFields extends ObjectFields,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedObjectFieldBuilderOptions<TFields, TRequired, TList, TImmutable>,
			TExtensionOptions,
			ObjectFieldValue<TFields>
		>,
	): DefaultedObjectField<TFields, TRequired, TList, TImmutable>
	<
		const TFields extends ObjectFields,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			NonDefaultedObjectFieldBuilderOptions<
				TFields,
				TRequired,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			ObjectFieldValue<TFields>
		>,
	): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>
}

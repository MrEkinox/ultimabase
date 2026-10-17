import type {
	CompatibleFieldOptionsExtension,
	FieldListOption,
	FieldListValue,
	ResolveFieldSourceTemplate,
} from '../fields/base/contract.js'
import type {
	DefaultedObjectField,
	DefaultedObjectFieldOptions,
	NonDefaultedObjectField,
	NonDefaultedObjectFieldOptions,
	ObjectFieldOptions,
	ObjectFields,
	ObjectFieldValue,
} from '../fields/builtins/object.js'
import type { EmbeddedFieldBuilder } from './field-builder-contract.js'

type DefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TEmbeddedBuilder,
> = Omit<
	DefaultedObjectFieldOptions<TFields, TNullable, TList, TImmutable>,
	'fields'
> & {
	readonly fields: (field: TEmbeddedBuilder) => TFields
}

type NonDefaultedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TEmbeddedBuilder,
> = Omit<
	NonDefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
	'fields'
> & {
	readonly fields: (field: TEmbeddedBuilder) => TFields
}

/** Describes one recursively embedded object builder call. */
export type EmbeddedObjectFieldBuilderOptions<
	TFields extends ObjectFields = ObjectFields,
	TEmbeddedBuilder = EmbeddedFieldBuilder,
> = Omit<ObjectFieldOptions<TFields>, 'fields' | 'indexed'> & {
	readonly fields: (field: TEmbeddedBuilder) => TFields
}

type DefaultedEmbeddedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TEmbeddedBuilder,
> = Omit<
	DefaultedObjectFieldOptions<TFields, TNullable, TList, TImmutable>,
	'fields' | 'indexed'
> & {
	readonly fields: (field: TEmbeddedBuilder) => TFields
}

type NonDefaultedEmbeddedObjectFieldBuilderOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TEmbeddedBuilder,
> = Omit<
	NonDefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
	'fields' | 'indexed'
> & {
	readonly fields: (field: TEmbeddedBuilder) => TFields
}

/** Preserves exact embedded fields and generated options for FieldBuilder.object. */
export interface ObjectFieldBuilderMethod<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
	TEmbeddedBuilder = EmbeddedFieldBuilder,
> {
	<
		const TFields extends ObjectFields,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedObjectFieldBuilderOptions<
				TFields,
				TNullable,
				TList,
				TImmutable,
				TEmbeddedBuilder
			>,
			TExtensionOptions,
			ObjectFieldValue<TFields>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<ObjectFieldValue<TFields>, TList>,
					TNullable extends true
						? FieldListValue<ObjectFieldValue<TFields>, TList> | null
						: FieldListValue<ObjectFieldValue<TFields>, TList>
				>,
				object
			>
		>,
	): DefaultedObjectField<TFields, TNullable, TList, TImmutable>
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
				TImmutable,
				TEmbeddedBuilder
			>,
			TExtensionOptions,
			ObjectFieldValue<TFields>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<ObjectFieldValue<TFields>, TList>,
					TRequired extends true
						? FieldListValue<ObjectFieldValue<TFields>, TList>
						: FieldListValue<ObjectFieldValue<TFields>, TList> | null
				>,
				object
			>
		>,
	): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>
}

/** Preserves exact nested maps while excluding root-only object metadata. */
export interface EmbeddedObjectFieldBuilderMethod<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
	TEmbeddedBuilder = EmbeddedFieldBuilder,
> {
	<
		const TFields extends ObjectFields,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedEmbeddedObjectFieldBuilderOptions<
				TFields,
				TNullable,
				TList,
				TImmutable,
				TEmbeddedBuilder
			>,
			TExtensionOptions,
			ObjectFieldValue<TFields>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<ObjectFieldValue<TFields>, TList>,
					TNullable extends true
						? FieldListValue<ObjectFieldValue<TFields>, TList> | null
						: FieldListValue<ObjectFieldValue<TFields>, TList>
				>,
				object
			>
		>,
	): DefaultedObjectField<TFields, TNullable, TList, TImmutable>
	<
		const TFields extends ObjectFields,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			NonDefaultedEmbeddedObjectFieldBuilderOptions<
				TFields,
				TRequired,
				TList,
				TImmutable,
				TEmbeddedBuilder
			>,
			TExtensionOptions,
			ObjectFieldValue<TFields>,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<ObjectFieldValue<TFields>, TList>,
					TRequired extends true
						? FieldListValue<ObjectFieldValue<TFields>, TList>
						: FieldListValue<ObjectFieldValue<TFields>, TList> | null
				>,
				object
			>
		>,
	): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>
}

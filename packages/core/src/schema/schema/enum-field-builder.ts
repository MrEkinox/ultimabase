import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
	FieldIndexOption,
	FieldListOption,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../fields/base/contract.js'
import type {
	CompactScalarFieldDefinition,
	DefaultedCompactScalarFieldOptions,
	NonDefaultedCompactScalarFieldOptions,
} from '../fields/base/factory.js'
import type {
	CompatibleEnumFieldOptions,
	EnumFieldOptions,
	EnumValue,
	EnumValues,
} from '../fields/builtins/enum.js'

/** Describes enum behavior available at one embedded object property. */
export type EmbeddedEnumFieldOptions<TValues extends EnumValues = EnumValues> =
	Omit<EnumFieldOptions<TValues>, 'indexed'>

type EnumBuilderContext = 'stored' | 'embedded'
type EnumBuilderOptions<
	TValues extends EnumValues,
	TContext extends EnumBuilderContext,
> = TContext extends 'stored'
	? EnumFieldOptions<TValues>
	: EmbeddedEnumFieldOptions<TValues>

type DefaultedEnumFieldBuilderOptions<
	TValues extends EnumValues,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TContext extends EnumBuilderContext,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	EnumBuilderOptions<TValues, TContext>,
	EnumValue<TValues>,
	TNullable,
	TList,
	TImmutable,
	object,
	TIndexed
> &
	CompatibleEnumFieldOptions<TValues>

type NonDefaultedEnumFieldBuilderOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TContext extends EnumBuilderContext,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	EnumBuilderOptions<TValues, TContext>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
> &
	CompatibleEnumFieldOptions<TValues>

/** Shares enum inference while retaining context-specific options and return aliases. */
export interface EnumFieldBuilderFactory<
	TSourceTemplate extends object,
	TContext extends EnumBuilderContext,
> {
	<
		const TValues extends EnumValues,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedEnumFieldBuilderOptions<
				TValues,
				TNullable,
				TList,
				TImmutable,
				TContext,
				TIndexed
			>,
			TExtensionOptions,
			EnumValue<TValues>,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				EnumValue<TValues>,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): TContext extends 'stored'
		? UniqueIndexedField<
				TIndexed,
				CompactScalarFieldDefinition<
					'enum',
					EnumValue<TValues>,
					EnumFieldOptions<TValues> & TExtensionOptions,
					DefaultedFieldNonNull<TNullable>,
					TList,
					TImmutable,
					true
				>
			>
		: CompactScalarFieldDefinition<
				'enum',
				EnumValue<TValues>,
				EmbeddedEnumFieldOptions<TValues>,
				DefaultedFieldNonNull<TNullable>,
				TList,
				TImmutable,
				true
			>
	<
		const TValues extends EnumValues,
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			NonDefaultedEnumFieldBuilderOptions<
				TValues,
				TRequired,
				TList,
				TImmutable,
				TContext,
				TIndexed
			>,
			TExtensionOptions,
			EnumValue<TValues>,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				EnumValue<TValues>,
				TList,
				TRequired
			>
		>,
	): TContext extends 'stored'
		? UniqueIndexedField<
				TIndexed,
				CompactScalarFieldDefinition<
					'enum',
					EnumValue<TValues>,
					EnumFieldOptions<TValues> & TExtensionOptions,
					TRequired,
					TList,
					TImmutable,
					false
				>
			>
		: CompactScalarFieldDefinition<
				'enum',
				EnumValue<TValues>,
				EmbeddedEnumFieldOptions<TValues>,
				TRequired,
				TList,
				TImmutable,
				false
			>
}

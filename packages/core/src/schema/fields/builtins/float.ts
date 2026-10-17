import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldOptions,
	FieldTypeState,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeNumberValue } from '../base/value.js'

/**
 * Defines declarative boundaries for floating-point values.
 */
/**
 * Describes floating-point metadata without promising decimal precision.
 */
export type FloatFieldOptions = FieldOptions<number>

/**
 * Carries a floating-point number and exact options through schema inference.
 */
export type FloatField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'float', number, FloatFieldOptions, TState>

type DefaultedFloatFieldOptions<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TNullable,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type ResolvedFloatField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'float',
	number,
	FloatFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedFloatField<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedFloatField<
	DefaultedFieldNonNull<TNullable>,
	TList,
	TImmutable,
	true
>

type NonDefaultedFloatField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedFloatField<TRequired, TList, TImmutable, false>

export interface FloatFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedFloatFieldOptions<TNullable, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				number,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedFloatField<TNullable, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedFloatFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedFloatField<TRequired, TList, TImmutable>
	>
}

/**
 * Declares a JavaScript floating-point number for approximate numeric values.
 *
 * @example
 * ```ts
 * floatField({ default: 0 })
 * ```
 */
export const floatField: FloatFieldFactory = createScalarFieldFactory(
	'float',
	normalizeNumberValue,
)

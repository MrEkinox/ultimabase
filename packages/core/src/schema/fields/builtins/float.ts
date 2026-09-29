import {
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
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
export type FloatField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'float', number, FloatFieldOptions, TTypegen>

const floatFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'float',
	optionKeys: fieldOptionKeys,
}

type DefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable
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
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedFloatField<TRequired, TList, TImmutable, true>

type NonDefaultedFloatField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedFloatField<TRequired, TList, TImmutable, false>

export interface FloatFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): DefaultedFloatField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): NonDefaultedFloatField<TRequired, TList, TImmutable>
}

const normalizeFloatFieldOptions = <const TOptions extends FloatFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	return normalizeFieldOptions(
		options,
		normalizeNumberValue,
		floatFieldOptionsContract,
	)
}

/**
 * Declares a JavaScript floating-point number for approximate numeric values.
 *
 * @example
 * ```ts
 * floatField({ default: 0 })
 * ```
 */
export const floatField: FloatFieldFactory = createCompactScalarFieldFactory<
	'float',
	number,
	FloatFieldOptions
>('float', normalizeFloatFieldOptions, normalizeNumberValue)

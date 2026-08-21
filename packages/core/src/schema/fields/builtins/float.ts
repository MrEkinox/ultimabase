import {
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeNumberValue } from '../base/value.js'
import type { FieldStandardSchema } from '../base/standard-schema.js'

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

/** Provides float-specific names for the shared compact scalar contract. */
type DefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type NonDefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	FloatFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
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

interface FloatFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedFloatFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedFloatField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedFloatFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
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
 * floatField({ validation: progressSchema })
 * ```
 */
export const floatField: FloatFieldFactory = createCompactScalarFieldFactory<
	'float',
	number,
	FloatFieldOptions
>('float', normalizeFloatFieldOptions, normalizeNumberValue)

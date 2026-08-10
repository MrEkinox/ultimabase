import { assertOptionalBoolean } from '@ultimabase/shared'
import {
	fieldOptionKeys,
	fieldValidationOptionKeys,
	normalizeFieldOptions,
	orderedRangeOptionKeys,
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
import {
	normalizeNumericValidation,
	type NumericValidationOptions,
} from '../constraints/numeric.js'
import type { NumericRange } from '../constraints/numeric.js'
import { normalizeNumberValue } from '../base/value.js'

/**
 * Defines declarative boundaries for floating-point values.
 */
export type FloatRangeValidationOptions = NumericRange

/**
 * Adds finite-value control to the common numeric validation contract.
 */
export interface FloatValidationOptions extends NumericValidationOptions {
	/**
	 * Rejects `NaN`, `Infinity`, and `-Infinity` when enabled.
	 *
	 * @example `finite: true`
	 */
	readonly finite?: boolean
}

/**
 * Describes floating-point metadata without promising decimal precision.
 */
export type FloatFieldOptions = FieldOptions<number, FloatValidationOptions>

/**
 * Carries a floating-point number and exact options through schema inference.
 */
export type FloatField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'float', number, FloatFieldOptions, TTypegen>

const floatFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'float',
	optionKeys: fieldOptionKeys,
	validationOptionKeys: [...fieldValidationOptionKeys, 'finite', 'range'],
	nestedValidation: [{ key: 'range', optionKeys: orderedRangeOptionKeys }],
}

/** Provides float-specific names for the shared compact scalar contract. */
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

interface FloatFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
	): DefaultedFloatField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
	): NonDefaultedFloatField<TRequired, TList, TImmutable>
}

const normalizeFloatValidation = (
	validation: FloatValidationOptions,
): Readonly<FloatValidationOptions> => {
	assertOptionalBoolean(validation.finite, 'validation.finite')

	return normalizeNumericValidation(
		validation,
		'a finite number',
		Number.isFinite,
	)
}

const normalizeFloatFieldOptions = <const TOptions extends FloatFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	return normalizeFieldOptions(
		options,
		normalizeFloatValidation,
		normalizeNumberValue,
		floatFieldOptionsContract,
	)
}

/**
 * Declares a JavaScript floating-point number for approximate numeric values.
 *
 * @example
 * ```ts
 * floatField({ validation: { finite: true, range: { min: 0, max: 5 } } })
 * ```
 */
export const floatField: FloatFieldFactory = createCompactScalarFieldFactory<
	'float',
	number,
	FloatFieldOptions
>('float', normalizeFloatFieldOptions, normalizeNumberValue)

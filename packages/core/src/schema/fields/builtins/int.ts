import { assertFieldOptions, normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	createGeneratedCompactScalarFieldFactory,
	type GeneratedScalarFieldOptions,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import {
	assertAutoIncrementOption,
	normalizeNumericValidation,
	type NumericValidationOptions,
} from '../constraints/numeric.js'
import type { NumericRange } from '../constraints/numeric.js'
import { normalizeSafeIntegerValue } from '../base/value.js'

/**
 * Defines declarative boundaries for safe JavaScript integers.
 */
export type IntRangeValidationOptions = NumericRange

/**
 * Combines common presence rules with safe-integer range constraints.
 */
export type IntValidationOptions = NumericValidationOptions

/**
 * Adds integer-only sequence metadata to the common field contract.
 */
export interface IntFieldOptions extends FieldOptions<
	number,
	IntValidationOptions
> {
	/**
	 * Requests a database-generated sequence value from adapters that support it.
	 *
	 * @example `autoIncrement: true`
	 */
	readonly autoIncrement?: boolean
}

/**
 * Carries a safe integer and its exact options through schema inference.
 */
export type IntField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'int', number, IntFieldOptions, TTypegen>

/** Provides integer-specific names for compact sequence inference. */
type DefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = DefaultedCompactScalarFieldOptions<
	IntFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>
>

type NonDefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	IntFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>
>

type ResolvedIntField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarFieldDefinition<
	'int',
	number,
	GeneratedScalarFieldOptions<IntFieldOptions, 'autoIncrement', TAutoIncrement>,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoIncrement
>

type DefaultedIntField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedIntField<TRequired, TList, TImmutable, true, TAutoIncrement>

type NonDefaultedIntField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedIntField<TRequired, TList, TImmutable, false, TAutoIncrement>

interface IntFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
	>(
		options: DefaultedIntFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoIncrement
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<TAutoIncrement, TList, true, false>
		>
	): DefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
	>(
		options?: NonDefaultedIntFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoIncrement
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<TAutoIncrement, TList, false, false>
		>
	): NonDefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
}

const normalizeIntValidation = (
	validation: IntValidationOptions,
): Readonly<IntValidationOptions> =>
	normalizeNumericValidation(validation, 'a safe integer', Number.isSafeInteger)

const normalizeIntFieldOptions = <const TOptions extends IntFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeIntValidation,
		normalizeSafeIntegerValue,
	)
}

/**
 * Declares a safe JavaScript integer between `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * ```ts
 * intField({ default: 0, validation: { range: { min: 0 } } })
 * ```
 */
export const intField: IntFieldFactory =
	createGeneratedCompactScalarFieldFactory<
		'int',
		number,
		IntFieldOptions,
		'autoIncrement',
		false
	>('int', normalizeIntFieldOptions, normalizeSafeIntegerValue)

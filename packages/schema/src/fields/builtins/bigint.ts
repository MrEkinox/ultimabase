import { assertFieldOptions, normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	createGeneratedCompactScalarFieldFactory,
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
import { normalizeBigintValue } from '../base/value.js'

/**
 * Defines declarative boundaries for native JavaScript bigint values.
 */
export type BigintRangeValidationOptions = NumericRange<bigint>

/**
 * Combines common presence rules with exact bigint range constraints.
 */
export type BigintValidationOptions = NumericValidationOptions<bigint>

/**
 * Adds sequence metadata to the exact bigint field contract.
 */
export interface BigintFieldOptions extends FieldOptions<
	bigint,
	BigintValidationOptions
> {
	/**
	 * Requests a database-generated sequence value from adapters that support it.
	 *
	 * @example `autoIncrement: true`
	 */
	readonly autoIncrement?: boolean
}

/**
 * Carries an exact bigint value and its options through schema inference.
 */
export type BigintField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'bigint', bigint, BigintFieldOptions, TInference>

/** Provides bigint-specific names for compact sequence inference. */
type DefaultedBigintFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = DefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>
>

type NonDefaultedBigintFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>
>

type ResolvedBigintField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarFieldDefinition<
	'bigint',
	bigint,
	BigintFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault,
	TAutoIncrement
>

type DefaultedBigintField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<
	TRequired,
	TNullable,
	TList,
	TImmutable,
	true,
	TAutoIncrement
>

type NonDefaultedBigintField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<
	TRequired,
	TNullable,
	TList,
	TImmutable,
	false,
	TAutoIncrement
>

interface BigintFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
	>(
		options: DefaultedBigintFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable,
			TAutoIncrement
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				TAutoIncrement,
				TList,
				true,
				false
			>
		>
	): DefaultedBigintField<
		TRequired,
		TNullable,
		TList,
		TImmutable,
		TAutoIncrement
	>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
	>(
		options?: NonDefaultedBigintFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable,
			TAutoIncrement
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				TAutoIncrement,
				TList,
				false,
				false
			>
		>
	): NonDefaultedBigintField<
		TRequired,
		TNullable,
		TList,
		TImmutable,
		TAutoIncrement
	>
}

const isBigint = (value: unknown): value is bigint => typeof value === 'bigint'

const normalizeBigintValidation = (
	validation: BigintValidationOptions,
): Readonly<BigintValidationOptions> =>
	normalizeNumericValidation(validation, 'a bigint', isBigint)

const normalizeBigintFieldOptions = <const TOptions extends BigintFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeBigintValidation,
		normalizeBigintValue,
	)
}

/**
 * Declares an exact native `bigint` for integer values outside JavaScript's safe-number range.
 *
 * @example
 * ```ts
 * bigintField({ default: 9_007_199_254_740_993n })
 * ```
 */
export const bigintField: BigintFieldFactory =
	createGeneratedCompactScalarFieldFactory<
		'bigint',
		bigint,
		BigintFieldOptions,
		'autoIncrement',
		false
	>('bigint', normalizeBigintFieldOptions, normalizeBigintValue)

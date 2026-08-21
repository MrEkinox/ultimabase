import {
	assertFieldOptions,
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
	type CompatibleGeneratedScalarOptions,
	createGeneratedCompactScalarFieldFactory,
	type GeneratedScalarFieldOptions,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { assertAutoIncrementOption } from '../constraints/numeric.js'
import { normalizeBigintValue } from '../base/value.js'
import type { FieldStandardSchema } from '../base/standard-schema.js'

/**
 * Defines declarative boundaries for native JavaScript bigint values.
 */
/**
 * Adds sequence metadata to the exact bigint field contract.
 */
export interface BigintFieldOptions extends FieldOptions<bigint> {
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
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'bigint', bigint, BigintFieldOptions, TTypegen>

const bigintFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'bigint',
	optionKeys: [...fieldOptionKeys, 'autoIncrement'],
}

/** Provides bigint-specific names for compact sequence inference. */
type DefaultedBigintFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>,
	TValidation
> &
	CompatibleGeneratedScalarOptions<
		'autoIncrement',
		TAutoIncrement,
		TList,
		true,
		false
	>

type NonDefaultedBigintFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>,
	TValidation
> &
	CompatibleGeneratedScalarOptions<
		'autoIncrement',
		TAutoIncrement,
		TList,
		false,
		false
	>

type ResolvedBigintField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarFieldDefinition<
	'bigint',
	bigint,
	GeneratedScalarFieldOptions<
		BigintFieldOptions,
		'autoIncrement',
		TAutoIncrement
	>,
	TRequired,
	TList,
	TImmutable,
	THasDefault,
	TAutoIncrement
>

type DefaultedBigintField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<TRequired, TList, TImmutable, true, TAutoIncrement>

type NonDefaultedBigintField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<TRequired, TList, TImmutable, false, TAutoIncrement>

interface BigintFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedBigintFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoIncrement,
			TValidation
		>,
	): DefaultedBigintField<TRequired, TList, TImmutable, TAutoIncrement>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedBigintFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TAutoIncrement,
			TValidation
		>,
	): NonDefaultedBigintField<TRequired, TList, TImmutable, TAutoIncrement>
}

const normalizeBigintFieldOptions = <const TOptions extends BigintFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeBigintValue,
		bigintFieldOptionsContract,
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

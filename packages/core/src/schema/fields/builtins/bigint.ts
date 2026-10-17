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
	type GeneratedScalarFieldOptions,
	type CompactScalarFieldDefinition,
	type CompatibleGeneratedScalarOptions,
	type DefaultedCompactScalarFieldOptions,
	type GeneratedScalarOption,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { assertAutoIncrementOption } from '../constraints/numeric.js'
import { normalizeBigintValue } from '../base/value.js'

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
export type BigintField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'bigint', bigint, BigintFieldOptions, TState>

/** Provides bigint-specific names for compact sequence inference. */
type DefaultedBigintFieldOptions<
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TNullable,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>,
	TIndexed
> &
	CompatibleGeneratedScalarOptions<
		'autoIncrement',
		TAutoIncrement,
		TList,
		true,
		false
	> &
	// The database's identity value is never null (ADR-0340).
	(TAutoIncrement extends true ? { readonly nullable?: false } : unknown)

type NonDefaultedBigintFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>,
	TIndexed
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
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<
	DefaultedFieldNonNull<TNullable>,
	TList,
	TImmutable,
	true,
	TAutoIncrement
>

type NonDefaultedBigintField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = ResolvedBigintField<TRequired, TList, TImmutable, false, TAutoIncrement>

export interface BigintFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBigintFieldOptions<
				TNullable,
				TList,
				TImmutable,
				TAutoIncrement,
				TIndexed
			>,
			TExtensionOptions,
			bigint,
			ResolvedFieldSourceOptions<
				TSourceTemplate,
				bigint,
				TList,
				DefaultedFieldNonNull<TNullable>
			>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedBigintField<TNullable, TList, TImmutable, TAutoIncrement>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBigintFieldOptions<
				TRequired,
				TList,
				TImmutable,
				TAutoIncrement,
				TIndexed
			>,
			TExtensionOptions,
			bigint,
			ResolvedFieldSourceOptions<TSourceTemplate, bigint, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedBigintField<TRequired, TList, TImmutable, TAutoIncrement>
	>
}

/**
 * Declares an exact native `bigint` for integer values outside JavaScript's safe-number range.
 *
 * @example
 * ```ts
 * bigintField({ default: 9_007_199_254_740_993n })
 * ```
 */
export const bigintField: BigintFieldFactory = createScalarFieldFactory(
	'bigint',
	normalizeBigintValue,
	{
		optionKeys: ['autoIncrement'],
		assertOptions: assertAutoIncrementOption,
	},
)

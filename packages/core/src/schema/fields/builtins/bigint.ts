import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarField,
	createScalarFieldFactory,
	type DefaultedGeneratedScalarFieldOptions,
	type GeneratedScalarFieldOptions,
	type NonDefaultedGeneratedScalarFieldOptions,
	type ScalarFieldDescriptor,
} from '../base/factory.js'
import { assertAutoIncrementOption } from '../constraints/numeric.js'
import { normalizeBigintValue } from '../base/value.js'

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

/** Provides bigint-specific names for compact sequence inference. */
type DefaultedBigintFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = DefaultedGeneratedScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TList,
	TImmutable,
	'autoIncrement',
	TAutoIncrement,
	false
>

type NonDefaultedBigintFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = NonDefaultedGeneratedScalarFieldOptions<
	BigintFieldOptions,
	bigint,
	TRequired,
	TList,
	TImmutable,
	'autoIncrement',
	TAutoIncrement,
	false
>

type BigintScalar<TAutoIncrement extends boolean> = ScalarFieldDescriptor<
	'bigint',
	bigint,
	GeneratedScalarFieldOptions<
		BigintFieldOptions,
		'autoIncrement',
		TAutoIncrement
	>
>

type DefaultedBigintField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarField<
	BigintScalar<TAutoIncrement>,
	TRequired,
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
> = CompactScalarField<
	BigintScalar<TAutoIncrement>,
	TRequired,
	TList,
	TImmutable,
	false,
	TAutoIncrement
>

export interface BigintFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBigintFieldOptions<TRequired, TList, TImmutable, TAutoIncrement>,
			TExtensionOptions,
			bigint,
			ResolvedFieldSourceOptions<TSourceTemplate, bigint, TList, TRequired>
		>,
	): DefaultedBigintField<TRequired, TList, TImmutable, TAutoIncrement>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBigintFieldOptions<
				TRequired,
				TList,
				TImmutable,
				TAutoIncrement
			>,
			TExtensionOptions,
			bigint,
			ResolvedFieldSourceOptions<TSourceTemplate, bigint, TList, TRequired>
		>,
	): NonDefaultedBigintField<TRequired, TList, TImmutable, TAutoIncrement>
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

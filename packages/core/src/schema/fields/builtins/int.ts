import type {
	CompatibleFieldOptionsExtension,
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
import { normalizeSafeIntegerValue } from '../base/value.js'

/**
 * Defines declarative boundaries for safe JavaScript integers.
 */
/**
 * Adds integer-only sequence metadata to the common field contract.
 */
export interface IntFieldOptions extends FieldOptions<number> {
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
export type IntField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'int', number, IntFieldOptions, TState>

/** Provides integer-specific names for compact sequence inference. */
type DefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	IntFieldOptions,
	number,
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
		true,
		false
	>

type NonDefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	IntFieldOptions,
	number,
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

export interface IntFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = true,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedIntFieldOptions<
				TRequired,
				TList,
				TImmutable,
				TAutoIncrement,
				TIndexed
			>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
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
			NonDefaultedIntFieldOptions<
				TRequired,
				TList,
				TImmutable,
				TAutoIncrement,
				TIndexed
			>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
	>
}

/**
 * Declares a safe JavaScript integer between `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * ```ts
 * intField({ default: 0, indexed: true })
 * ```
 */
export const intField: IntFieldFactory = createScalarFieldFactory(
	'int',
	normalizeSafeIntegerValue,
	{
		optionKeys: ['autoIncrement'],
		assertOptions: assertAutoIncrementOption,
	},
)

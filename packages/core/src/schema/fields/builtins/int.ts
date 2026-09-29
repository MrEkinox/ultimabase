import {
	assertFieldOptions,
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
	ResolvedFieldSourceOptions,
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
export type IntField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'int', number, IntFieldOptions, TTypegen>

const intFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'int',
	optionKeys: [...fieldOptionKeys, 'autoIncrement'],
}

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
> = NonDefaultedCompactScalarFieldOptions<
	IntFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<'autoIncrement', TAutoIncrement>
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
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedIntFieldOptions<TRequired, TList, TImmutable, TAutoIncrement>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList>
		>,
	): DefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedIntFieldOptions<TRequired, TList, TImmutable, TAutoIncrement>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList>
		>,
	): NonDefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
}

const normalizeIntFieldOptions = <const TOptions extends IntFieldOptions>(
	options: TOptions,
): Readonly<TOptions> => {
	assertFieldOptions(options)
	assertAutoIncrementOption(options)

	return normalizeFieldOptions(
		options,
		normalizeSafeIntegerValue,
		intFieldOptionsContract,
	)
}

/**
 * Declares a safe JavaScript integer between `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * ```ts
 * intField({ default: 0, indexed: true })
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

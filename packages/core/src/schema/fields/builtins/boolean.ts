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
import { normalizeBooleanValue } from '../base/value.js'
import type { FieldStandardSchema } from '../base/standard-schema.js'

/**
 * Describes boolean metadata through the common field contract.
 */
export type BooleanFieldOptions = FieldOptions<boolean>

/**
 * Carries the boolean value type and exact options through schema inference.
 */
export type BooleanField<
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'boolean', boolean, BooleanFieldOptions, TTypegen>

const booleanFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'boolean',
	optionKeys: fieldOptionKeys,
}

/** Provides boolean-specific names for the shared compact scalar contract. */
type DefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type NonDefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type ResolvedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'boolean',
	boolean,
	BooleanFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBooleanField<TRequired, TList, TImmutable, true>

type NonDefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBooleanField<TRequired, TList, TImmutable, false>

interface BooleanFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedBooleanFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedBooleanField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedBooleanFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): NonDefaultedBooleanField<TRequired, TList, TImmutable>
}

const normalizeBooleanFieldOptions = <
	const TOptions extends BooleanFieldOptions,
>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(
		options,
		normalizeBooleanValue,
		booleanFieldOptionsContract,
	)

/**
 * Declares a `true` or `false` value.
 *
 * @example
 * ```ts
 * booleanField({ default: false, indexed: true })
 * ```
 */
export const booleanField: BooleanFieldFactory =
	createCompactScalarFieldFactory<'boolean', boolean, BooleanFieldOptions>(
		'boolean',
		normalizeBooleanFieldOptions,
		normalizeBooleanValue,
	)

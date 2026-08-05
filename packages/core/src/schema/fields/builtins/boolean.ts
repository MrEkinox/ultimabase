import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	FieldValidationOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeBooleanValue } from '../base/value.js'

/**
 * Names the presence-only validation contract exposed by boolean fields.
 */
export type BooleanValidationOptions = FieldValidationOptions

/**
 * Describes boolean metadata through the common field contract.
 */
export type BooleanFieldOptions = FieldOptions<boolean>

/**
 * Carries the boolean value type and exact options through schema inference.
 */
export type BooleanField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'boolean', boolean, BooleanFieldOptions, TInference>

/** Provides boolean-specific names for the shared compact scalar contract. */
type DefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable
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
	>(
		options: DefaultedBooleanFieldOptions<TRequired, TList, TImmutable>,
	): DefaultedBooleanField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedBooleanFieldOptions<TRequired, TList, TImmutable>,
	): NonDefaultedBooleanField<TRequired, TList, TImmutable>
}

const normalizeBooleanFieldOptions = <
	const TOptions extends BooleanFieldOptions,
>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeFlatValidation, normalizeBooleanValue)

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

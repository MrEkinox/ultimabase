import {
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeBooleanValue } from '../base/value.js'

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

export interface BooleanFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBooleanFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			boolean,
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList>
		>,
	): DefaultedBooleanField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBooleanFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			boolean,
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList>
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

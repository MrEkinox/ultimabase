import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypegenState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarField,
	createScalarFieldFactory,
	type DefaultedScalarFieldOptions,
	type NonDefaultedScalarFieldOptions,
	type ScalarFieldDescriptor,
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

type BooleanScalar = ScalarFieldDescriptor<
	'boolean',
	boolean,
	BooleanFieldOptions
>

type DefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedScalarFieldOptions<BooleanScalar, TRequired, TList, TImmutable>

type NonDefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedScalarFieldOptions<BooleanScalar, TRequired, TList, TImmutable>

type DefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<BooleanScalar, TRequired, TList, TImmutable, true>

type NonDefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<BooleanScalar, TRequired, TList, TImmutable, false>

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
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList, TRequired>
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
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList, TRequired>
		>,
	): NonDefaultedBooleanField<TRequired, TList, TImmutable>
}

/**
 * Declares a `true` or `false` value.
 *
 * @example
 * ```ts
 * booleanField({ default: false, indexed: true })
 * ```
 */
export const booleanField: BooleanFieldFactory = createScalarFieldFactory(
	'boolean',
	normalizeBooleanValue,
)

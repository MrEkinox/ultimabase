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
import { normalizeNumberValue } from '../base/value.js'

/**
 * Describes floating-point metadata without promising decimal precision.
 */
export type FloatFieldOptions = FieldOptions<number>

/**
 * Carries a floating-point number and exact options through schema inference.
 */
export type FloatField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'float', number, FloatFieldOptions, TTypegen>

type FloatScalar = ScalarFieldDescriptor<'float', number, FloatFieldOptions>

type DefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedScalarFieldOptions<FloatScalar, TRequired, TList, TImmutable>

type NonDefaultedFloatFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedScalarFieldOptions<FloatScalar, TRequired, TList, TImmutable>

type DefaultedFloatField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<FloatScalar, TRequired, TList, TImmutable, true>

type NonDefaultedFloatField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<FloatScalar, TRequired, TList, TImmutable, false>

export interface FloatFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): DefaultedFloatField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedFloatFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): NonDefaultedFloatField<TRequired, TList, TImmutable>
}

/**
 * Declares a JavaScript floating-point number for approximate numeric values.
 *
 * @example
 * ```ts
 * floatField({ default: 0 })
 * ```
 */
export const floatField: FloatFieldFactory = createScalarFieldFactory(
	'float',
	normalizeNumberValue,
)

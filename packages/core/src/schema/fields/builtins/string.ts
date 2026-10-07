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
import { normalizeStringValue } from '../base/value.js'

/**
 * Describes string metadata without coupling validation to a runtime.
 */
export type StringFieldOptions = FieldOptions<string>

/**
 * Carries the string value type and exact options through later schema inference.
 */
export type StringField<
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<'string', string, StringFieldOptions, TTypegen>

type StringScalar = ScalarFieldDescriptor<'string', string, StringFieldOptions>

type DefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedScalarFieldOptions<StringScalar, TRequired, TList, TImmutable>

type NonDefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedScalarFieldOptions<StringScalar, TRequired, TList, TImmutable>

type DefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<StringScalar, TRequired, TList, TImmutable, true>

type NonDefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactScalarField<StringScalar, TRequired, TList, TImmutable, false>

export interface StringFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedStringFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedStringField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedStringFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): NonDefaultedStringField<TRequired, TList, TImmutable>
}

/**
 * Declares a UTF-16 JavaScript string with portable field metadata.
 *
 * @example
 * ```ts
 * stringField({
 *   required: true,
 *   indexed: true,
 * })
 * ```
 */
export const stringField: StringFieldFactory = createScalarFieldFactory(
	'string',
	normalizeStringValue,
)

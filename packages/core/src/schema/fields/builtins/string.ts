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

const stringFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'string',
	optionKeys: fieldOptionKeys,
}

type DefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type ResolvedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'string',
	string,
	StringFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TList, TImmutable, true>

type NonDefaultedStringField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedStringField<TRequired, TList, TImmutable, false>

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
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList>
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
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList>
		>,
	): NonDefaultedStringField<TRequired, TList, TImmutable>
}

const normalizeStringFieldOptions = <const TOptions extends StringFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(
		options,
		normalizeStringValue,
		stringFieldOptionsContract,
	)

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
export const stringField: StringFieldFactory = createCompactScalarFieldFactory<
	'string',
	string,
	StringFieldOptions
>('string', normalizeStringFieldOptions, normalizeStringValue)

import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldTypeState,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
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
export type StringField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'string', string, StringFieldOptions, TState>

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

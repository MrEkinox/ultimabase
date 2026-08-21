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
import { normalizeStringValue } from '../base/value.js'
import type { FieldStandardSchema } from '../base/standard-schema.js'

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

/** Provides string-specific names for the shared compact scalar contract. */
type DefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type NonDefaultedStringFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	StringFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
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

interface StringFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedStringFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedStringField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedStringFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
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
 * Declares a UTF-16 JavaScript string with optional Standard Schema validation.
 *
 * @example
 * ```ts
 * stringField({
 *   required: true,
 *   validation: nonEmptyName,
 * })
 * ```
 */
export const stringField: StringFieldFactory = createCompactScalarFieldFactory<
	'string',
	string,
	StringFieldOptions
>('string', normalizeStringFieldOptions, normalizeStringValue)

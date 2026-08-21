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
 * Describes storage-neutral UUID metadata through its canonical string value.
 */
export type UuidFieldOptions = FieldOptions<string>

/**
 * Carries the UUID value and exact options through schema inference.
 */
export type UuidField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'uuid', string, UuidFieldOptions, TTypegen>

const uuidFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'uuid',
	optionKeys: fieldOptionKeys,
}

/** Provides UUID-specific names for the shared compact scalar contract. */
type DefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = DefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type NonDefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TValidation extends FieldStandardSchema,
> = NonDefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TValidation
>

type ResolvedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'uuid',
	string,
	UuidFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TList, TImmutable, true>

type NonDefaultedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TList, TImmutable, false>

interface UuidFieldFactory {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options: DefaultedUuidFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): DefaultedUuidField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TValidation extends FieldStandardSchema = FieldStandardSchema,
	>(
		options?: NonDefaultedUuidFieldOptions<
			TRequired,
			TList,
			TImmutable,
			TValidation
		>,
	): NonDefaultedUuidField<TRequired, TList, TImmutable>
}

const normalizeUuidFieldOptions = <const TOptions extends UuidFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeStringValue, uuidFieldOptionsContract)

/**
 * Declares a canonical UUID string with optional Standard Schema validation.
 *
 * @example
 * ```ts
 * uuidField({ indexed: "unique", required: true, validation: uuidV7Schema })
 * ```
 */
export const uuidField: UuidFieldFactory = createCompactScalarFieldFactory<
	'uuid',
	string,
	UuidFieldOptions
>('uuid', normalizeUuidFieldOptions, normalizeStringValue)

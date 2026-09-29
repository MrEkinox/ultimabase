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

type DefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
>

type NonDefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable
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

export interface UuidFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedUuidFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): DefaultedUuidField<TRequired, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedUuidFieldOptions<TRequired, TList, TImmutable>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): NonDefaultedUuidField<TRequired, TList, TImmutable>
}

const normalizeUuidFieldOptions = <const TOptions extends UuidFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeStringValue, uuidFieldOptionsContract)

/**
 * Declares a canonical UUID string with portable field metadata.
 *
 * @example
 * ```ts
 * uuidField({ indexed: "unique", required: true })
 * ```
 */
export const uuidField: UuidFieldFactory = createCompactScalarFieldFactory<
	'uuid',
	string,
	UuidFieldOptions
>('uuid', normalizeUuidFieldOptions, normalizeStringValue)

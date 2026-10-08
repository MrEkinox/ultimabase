import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createFieldDefinition } from '../base/definition.js'
import {
	assertFieldOptions,
	assertValidTypeName,
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
} from '../base/contract.js'
import {
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'

export type EnumValues = readonly string[] | Readonly<Record<string, string>>

/**
 * Infers persisted values from either a tuple or a symbolic key-value mapping.
 */
export type EnumValue<TValues extends EnumValues> =
	TValues extends readonly string[]
		? TValues[number]
		: TValues[keyof TValues] & string

interface EnumValuesOption<TValues extends EnumValues> {
	/**
	 * Declares persisted values as a non-empty string tuple or a symbolic key-value mapping.
	 *
	 * @example `values: ["draft", "published"]`
	 * @example `values: { Draft: "draft", Published: "published" }`
	 */
	readonly values: TValues
}

/**
 * Combines the exact enum source with field options constrained to its values.
 */
export interface EnumFieldOptions<TValues extends EnumValues = EnumValues>
	extends FieldOptions<EnumValue<TValues>>, EnumValuesOption<TValues> {
	/**
	 * Overrides the stable generated type name used by schema generators.
	 *
	 * @example `typeName: "ProductStatus"`
	 */
	readonly typeName?: string
}

/**
 * Carries the inferred string union and exact options through schema inference.
 */
export type EnumField<
	TValues extends EnumValues = EnumValues,
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TTypegen
>

const enumFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'enum',
	optionKeys: [...fieldOptionKeys, 'typeName', 'values'],
}

type NonEmptyMapping<TValues extends EnumValues> =
	TValues extends readonly string[]
		? TValues extends readonly []
			? never
			: TValues
		: keyof TValues extends never
			? never
			: TValues

export type CompatibleEnumFieldOptions<TValues extends EnumValues> =
	NonEmptyMapping<TValues> extends never ? { readonly values: never } : object

/** Preserves the enum domain while naming only operation-relevant options. */
type DefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type NonDefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type ResolvedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TList, TImmutable, true>

type NonDefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TList, TImmutable, false>

interface NormalizedEnumSource {
	readonly metadata: EnumValues
	readonly values: readonly string[]
}

const normalizeEnumValues = (source: unknown): NormalizedEnumSource => {
	const list = isUnknownArray(source)

	if (!list && !isPlainRecord(source)) {
		throw new TypeError('Enum values must be a string list or mapping')
	}

	const declared = list ? source : Object.values(source)

	if (declared.length === 0) {
		throw new TypeError('Enum values cannot be empty')
	}

	if (!declared.every((value) => typeof value === 'string')) {
		throw new TypeError('Enum values must contain only strings')
	}

	const duplicate = declared.find(
		(value, index) => declared.indexOf(value) !== index,
	)

	if (duplicate !== undefined) {
		throw new TypeError(`Duplicate enum value: ${duplicate}`)
	}

	const values = immutableArray(declared)

	// Mapping keys remain available to future schema and SDK generators; every
	// entry value was proven to be a string above.
	return {
		metadata: list
			? values
			: immutableRecord(
					Object.fromEntries(
						Object.entries(source).filter(
							(entry): entry is [string, string] =>
								typeof entry[1] === 'string',
						),
					),
				),
		values,
	}
}

/**
 * Declares a closed string domain from a tuple, string enum, or key-value mapping.
 *
 * @example
 * ```ts
 * enumField({
 *   typeName: "ProductStatus",
 *   values: { Draft: "draft", Published: "published" },
 *   default: "draft",
 * })
 * ```
 */
export function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		DefaultedEnumFieldOptions<TValues, TRequired, TList, TImmutable>,
		TExtensionOptions,
		EnumValue<TValues>
	>,
): DefaultedEnumField<TValues, TRequired, TList, TImmutable>

export function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		NonDefaultedEnumFieldOptions<TValues, TRequired, TList, TImmutable>,
		TExtensionOptions,
		EnumValue<TValues>
	>,
): NonDefaultedEnumField<TValues, TRequired, TList, TImmutable>

export function enumField(options: EnumFieldOptions): EnumField {
	assertFieldOptions(options)
	assertValidTypeName(options.typeName)

	const { metadata, values } = normalizeEnumValues(options.values)
	const snapshotValue = (value: unknown, path: string): string => {
		if (typeof value !== 'string' || !values.includes(value)) {
			const location = path === 'default' ? '' : ` at ${path}`

			throw new TypeError(`Invalid enum default${location}: ${String(value)}`)
		}

		return value
	}
	const normalized = normalizeFieldOptions(
		options,
		snapshotValue,
		enumFieldOptionsContract,
	)

	// Like object and pointer fields, enum fields record no Core options contract,
	// so application compilation keeps their unresolved option keys.
	return createFieldDefinition(
		'enum',
		immutableRecord({ ...normalized, values: metadata }),
		snapshotValue,
	)
}

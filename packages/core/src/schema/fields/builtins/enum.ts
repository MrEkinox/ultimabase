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
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompatibleScalarPresence,
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'

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
	 * Overrides the stable generated type name used by GraphQL and other schema generators.
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
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TInference
>

type NonEmptyMapping<TValues extends EnumValues> =
	TValues extends readonly string[]
		? TValues extends readonly []
			? never
			: TValues
		: keyof TValues extends never
			? never
			: TValues

type CompatibleEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
> =
	NonEmptyMapping<TValues> extends never
		? never
		: CompatibleScalarPresence<TRequired, TNullable>

/** Preserves the enum domain while naming only operation-relevant options. */
type DefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type NonDefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type ResolvedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TNullable, TList, TImmutable, true>

type NonDefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TNullable, TList, TImmutable, false>

const isString = (value: unknown): value is string => typeof value === 'string'

const assertUniqueValues = (values: readonly string[]): void => {
	const seen = new Set<string>()

	for (const value of values) {
		if (seen.has(value)) {
			throw new TypeError(`Duplicate enum value: ${value}`)
		}

		seen.add(value)
	}
}

interface NormalizedEnumSource {
	readonly metadata: EnumValues
	readonly values: readonly string[]
}

const normalizeEnumValues = (source: unknown): NormalizedEnumSource => {
	if (isUnknownArray(source)) {
		if (source.length === 0) {
			throw new TypeError('Enum values cannot be empty')
		}

		if (!source.every(isString)) {
			throw new TypeError('Enum values must contain only strings')
		}

		assertUniqueValues(source)

		const values = immutableArray(source)

		return immutableRecord({
			metadata: values,
			values,
		})
	}

	if (!isPlainRecord(source)) {
		throw new TypeError('Enum values must be a string list or mapping')
	}

	const entries = Object.entries(source)

	if (entries.length === 0) {
		throw new TypeError('Enum values cannot be empty')
	}

	const mapping: Record<string, string> = {}
	const values: string[] = []

	for (const [key, value] of entries) {
		if (!isString(value)) {
			throw new TypeError('Enum values must contain only strings')
		}

		mapping[key] = value
		values.push(value)
	}

	assertUniqueValues(values)

	// Mapping keys remain available to future GraphQL and SDK generators.
	return immutableRecord({
		metadata: immutableRecord(mapping),
		values: immutableArray(values),
	})
}

/** Reads the persisted enum domain from either supported declaration shape. */
const isEnumValueList = (values: EnumValues): values is readonly string[] =>
	Array.isArray(values)

export const readEnumValues = (values: EnumValues): readonly string[] => {
	return isEnumValueList(values) ? values : Object.values(values)
}

const snapshotEnumValue = (
	values: readonly string[],
	value: unknown,
	path: string,
): string => {
	if (typeof value !== 'string' || !values.includes(value)) {
		const location = path === 'default' ? '' : ` at ${path}`

		throw new TypeError(`Invalid enum default${location}: ${String(value)}`)
	}

	return value
}

const normalizeEnumFieldOptions = (
	options: EnumFieldOptions,
): Readonly<EnumFieldOptions> => {
	assertFieldOptions(options)
	assertValidTypeName(options.typeName)

	const enumSource = normalizeEnumValues(options.values)
	const normalized = normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		(value, path) => snapshotEnumValue(enumSource.values, value, path),
	)

	return immutableRecord({
		...normalized,
		values: enumSource.metadata,
	})
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
	const TNullable extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
>(
	options: DefaultedEnumFieldOptions<
		TValues,
		TRequired,
		TNullable,
		TList,
		TImmutable
	>,
	...invalidOptions: InvalidOptionsArguments<
		CompatibleEnumFieldOptions<TValues, TRequired, TNullable>
	>
): DefaultedEnumField<TValues, TRequired, TNullable, TList, TImmutable>

export function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TNullable extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
>(
	options: NonDefaultedEnumFieldOptions<
		TValues,
		TRequired,
		TNullable,
		TList,
		TImmutable
	>,
	...invalidOptions: InvalidOptionsArguments<
		CompatibleEnumFieldOptions<TValues, TRequired, TNullable>
	>
): NonDefaultedEnumField<TValues, TRequired, TNullable, TList, TImmutable>

export function enumField(
	options: EnumFieldOptions,
	...invalidOptions: readonly never[]
): EnumField {
	// The rest parameter exists only to keep invalid generic calls uncallable.
	void invalidOptions
	const { hooks, metadataOptions } = splitFieldDeclarationOptions(options)
	const normalized = normalizeEnumFieldOptions(metadataOptions)
	const values = readEnumValues(normalized.values)

	return createFieldDefinition(
		'enum',
		normalized,
		(value, path) => snapshotEnumValue(values, value, path),
		hooks,
	)
}

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
	FieldOptions,
	ValidatedFieldOptions,
} from '../base/contract.js'

export type EnumValues = readonly string[] | Readonly<Record<string, string>>

/**
 * Infers persisted values from either a tuple or a symbolic key-value mapping.
 */
export type EnumValue<TValues extends EnumValues> =
	TValues extends readonly string[]
		? TValues[number]
		: TValues[keyof TValues] & string

/**
 * Combines the exact enum source with field options constrained to its values.
 */
export type EnumFieldOptions<TValues extends EnumValues = EnumValues> =
	FieldOptions<EnumValue<TValues>> & {
		readonly typeName?: string
		readonly values: TValues
	}

/**
 * Carries the inferred string union and exact options through schema inference.
 */
export type EnumField<
	TValues extends EnumValues = EnumValues,
	TOptions extends EnumFieldOptions<TValues> = EnumFieldOptions<TValues>,
> = FieldDefinition<'enum', EnumValue<TValues>, TOptions>

type NonEmptyMapping<TValues extends EnumValues> =
	TValues extends readonly string[]
		? TValues extends readonly []
			? never
			: TValues
		: keyof TValues extends never
			? never
			: TValues

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
 * Creates immutable enum metadata from a tuple, string enum, or key-value mapping.
 */
export function enumField<
	const TValues extends EnumValues,
	const TOptions extends EnumFieldOptions<TValues>,
>(
	options: TOptions & { readonly values: NonEmptyMapping<TValues> } & Omit<
			EnumFieldOptions<NoInfer<TValues>>,
			'values'
		> &
		(ValidatedFieldOptions<NoInfer<TOptions>, EnumValue<TValues>> extends never
			? never
			: unknown),
): EnumField<TValues, TOptions>

export function enumField(options: EnumFieldOptions): EnumField {
	const normalized = normalizeEnumFieldOptions(options)
	const values = readEnumValues(normalized.values)

	return createFieldDefinition('enum', normalized, (value, path) =>
		snapshotEnumValue(values, value, path),
	)
}

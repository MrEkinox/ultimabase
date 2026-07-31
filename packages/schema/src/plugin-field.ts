import { immutableRecord } from '@ultimabase/shared'

import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from './field.js'
import { isPlainRecord } from './runtime-value.js'

/**
 * Reserves framework-owned discriminants so plugin fields cannot shadow built-ins.
 */
export type ReservedFieldKind =
	| 'array'
	| 'bigint'
	| 'binary'
	| 'boolean'
	| 'date'
	| 'dateTime'
	| 'decimal'
	| 'enum'
	| 'float'
	| 'int'
	| 'json'
	| 'object'
	| 'plugin'
	| 'string'
	| 'time'
	| 'uuid'

type AvailablePluginFieldKind<TKind extends string> =
	TKind extends ReservedFieldKind
		? never
		: TKind extends `${infer TNamespace}.${infer TName}`
			? TNamespace extends ''
				? never
				: TName extends ''
					? never
					: TKind
			: never

/**
 * Carries a namespaced plugin kind while retaining the regular field contract.
 */
export type PluginFieldDefinition<
	TKind extends string = string,
	TValue = unknown,
	TOptions extends object = FieldOptions<TValue>,
> = FieldDefinition<TKind, TValue, TOptions>

/**
 * Lets a plugin normalize its own constraints and scalar values through Schema.
 */
export interface PluginFieldNormalizers<
	TValue,
	TValidation extends FieldValidationOptions,
> {
	readonly normalizeValidation?: (
		validation: TValidation,
	) => Readonly<TValidation>
	readonly normalizeValue: (value: unknown, path: string) => TValue
}

type PluginValueNormalizer = (value: unknown, path: string) => unknown

// Weak ownership keeps capabilities tied to field identity without creating app state.
const pluginValueNormalizers = new WeakMap<object, PluginValueNormalizer>()

/**
 * Creates a plugin-owned field while reusing common defaults, lists, and extensions.
 */
export const definePluginField = <
	TValue,
	const TKind extends string,
	TValidation extends FieldValidationOptions,
	const TOptions extends FieldOptions<TValue, TValidation>,
>(
	kind: AvailablePluginFieldKind<TKind>,
	options: TOptions,
	normalizers: PluginFieldNormalizers<TValue, TValidation>,
): PluginFieldDefinition<TKind, TValue, TOptions> => {
	if (typeof kind !== 'string' || kind.length === 0) {
		throw new TypeError('Plugin field kind must be a non-empty string')
	}

	const separator = kind.indexOf('.')

	if (
		separator <= 0 ||
		separator === kind.length - 1 ||
		kind.trim() !== kind ||
		/\s/u.test(kind)
	) {
		throw new TypeError('Plugin field kind must use a namespaced identifier')
	}

	if (
		!isPlainRecord(normalizers) ||
		typeof normalizers.normalizeValue !== 'function'
	) {
		throw new TypeError('Plugin field normalizeValue must be a function')
	}

	if (
		normalizers.normalizeValidation !== undefined &&
		typeof normalizers.normalizeValidation !== 'function'
	) {
		throw new TypeError(
			'Plugin field normalizeValidation must be a function when provided',
		)
	}

	const field = immutableRecord({
		kind,
		options: normalizeFieldOptions(
			options,
			normalizers.normalizeValidation ?? normalizeFlatValidation,
			normalizers.normalizeValue,
		),
	})

	pluginValueNormalizers.set(field, normalizers.normalizeValue)

	return field
}

/**
 * Reuses a plugin's scalar snapshot contract inside structured static defaults.
 */
export const snapshotPluginFieldValue = (
	field: FieldDefinition<string, unknown, object>,
	value: unknown,
	path: string,
): unknown => {
	const normalizeValue = pluginValueNormalizers.get(field)

	if (normalizeValue === undefined) {
		throw new TypeError(
			`${path} uses a plugin field not created by definePluginField`,
		)
	}

	return normalizeValue(value, path)
}

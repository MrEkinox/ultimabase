import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from './field.js'

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
	TKind extends ReservedFieldKind ? never : TKind

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
	readonly normalizeValidation: (
		validation: TValidation,
	) => Readonly<TValidation>
	readonly normalizeValue: (value: unknown, path: string) => TValue
}

const reservedFieldKinds: ReadonlySet<string> = new Set<ReservedFieldKind>([
	'array',
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'plugin',
	'string',
	'time',
	'uuid',
])

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

	if (reservedFieldKinds.has(kind)) {
		throw new TypeError(`Plugin field kind is reserved: ${kind}`)
	}

	return immutableRecord({
		kind,
		options: normalizeFieldOptions(
			options,
			normalizers.normalizeValidation,
			normalizers.normalizeValue,
		),
	})
}

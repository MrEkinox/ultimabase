import { immutableRecord } from '@ultimabase/shared'

import { snapshotBinaryValue } from './binary-field.js'
import { isBuiltInField, type BuiltInField } from './built-in-field.js'
import { normalizeCalendarDate } from './date-field.js'
import { createDateTimeNormalizer } from './date-time-field.js'
import { normalizeDecimalValue } from './decimal-field.js'
import type { EnumValues } from './enum-field.js'
import {
	assertFieldOptionsObject,
	assertValidTypeName,
	getFieldListDepth,
	normalizeFieldOptions,
	normalizeFlatValidation,
	snapshotFieldValue,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValue,
	GenericField,
	ValidatedFieldOptions,
} from './field.js'
import { assertFieldDefinitionTree } from './field-tree.js'
import { snapshotJsonValue } from './json-field.js'
import { snapshotPluginFieldValue } from './plugin-field.js'
import { assertNonEmptyString, isPlainRecord } from './runtime-value.js'
import {
	normalizeBigintValue,
	normalizeBooleanValue,
	normalizeNumberValue,
	normalizeSafeIntegerValue,
	normalizeStringValue,
} from './scalar-value.js'
import { createTimeNormalizer } from './time-field.js'

/**
 * Names the child fields of one object definition.
 */
export type ObjectFields = Readonly<Record<string, GenericField>>

/**
 * Builds the logical value represented by a structured field tree.
 */
export type ObjectFieldValue<TFields extends ObjectFields> = {
	readonly [TKey in keyof TFields]: FieldValue<TFields[TKey]>
}

/**
 * Keeps object structure inside neutral schema metadata.
 */
export type ObjectFieldOptions<TFields extends ObjectFields = ObjectFields> =
	FieldOptions<ObjectFieldValue<TFields>> & {
		readonly fields: TFields
		readonly typeName?: string
	}

/**
 * Carries a structured object value while leaving physical storage to adapters.
 */
export type ObjectField<
	TFields extends ObjectFields = ObjectFields,
	TOptions extends object = ObjectFieldOptions<TFields>,
> = FieldDefinition<'object', ObjectFieldValue<TFields>, TOptions>

type ValidatedObjectOptions<TOptions extends { readonly fields: object }> =
	TOptions extends {
		readonly fields: infer TFields extends ObjectFields
	}
		? Omit<TOptions, 'default'> extends Omit<
				ObjectFieldOptions<TFields>,
				'default'
			>
			? ValidatedFieldOptions<TOptions, ObjectFieldValue<TFields>> extends never
				? never
				: TOptions
			: never
		: never

type FieldsFromOptions<TOptions extends { readonly fields: object }> =
	TOptions extends {
		readonly fields: infer TFields extends ObjectFields
	}
		? TFields
		: ObjectFields

const isEnumValueList = (values: EnumValues): values is readonly string[] =>
	Array.isArray(values)

const snapshotEnumValue = (
	field: Extract<BuiltInField, { readonly kind: 'enum' }>,
	value: unknown,
	path: string,
): string => {
	const values = isEnumValueList(field.options.values)
		? field.options.values
		: Object.values(field.options.values)

	if (typeof value !== 'string' || !values.includes(value)) {
		throw new TypeError(`${path} must be a declared enum value`)
	}

	return value
}

const snapshotBuiltInScalarValue = (
	field: BuiltInField,
	value: unknown,
	path: string,
): unknown => {
	switch (field.kind) {
		case 'bigint':
			return normalizeBigintValue(value, path)
		case 'binary':
			return snapshotBinaryValue(value, path)
		case 'boolean':
			return normalizeBooleanValue(value, path)
		case 'date':
			return normalizeCalendarDate(value, path)
		case 'dateTime':
			return createDateTimeNormalizer(field.options.timezone ?? true)(
				value,
				path,
			)
		case 'decimal':
			return normalizeDecimalValue(value, path)
		case 'enum':
			return snapshotEnumValue(field, value, path)
		case 'float':
			return normalizeNumberValue(value, path)
		case 'int':
			return normalizeSafeIntegerValue(value, path)
		case 'json':
			return snapshotJsonValue(value, path)
		case 'object':
			return snapshotObjectValue(value, field.options.fields, path)
		case 'string':
		case 'uuid':
			return normalizeStringValue(value, path)
		case 'time':
			return createTimeNormalizer(field.options.timezone ?? false)(value, path)
	}
}

/**
 * Reapplies one field's scalar and list contract at every static snapshot boundary.
 */
export const snapshotFieldStaticValue = (
	field: GenericField,
	value: unknown,
	path: string,
): unknown =>
	snapshotFieldValue(
		value,
		getFieldListDepth(field.options),
		(item, itemPath) =>
			isBuiltInField(field)
				? snapshotBuiltInScalarValue(field, item, itemPath)
				: snapshotPluginFieldValue(field, item, itemPath),
		path,
	)

function snapshotObjectValue(
	value: unknown,
	fields: ObjectFields,
	path: string,
): Readonly<Record<string, unknown>> {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	for (const key of Object.keys(value)) {
		if (!Object.hasOwn(fields, key)) {
			throw new TypeError(`${path}.${key} is not a declared field`)
		}
	}

	for (const key of Object.keys(fields)) {
		if (!Object.hasOwn(value, key)) {
			throw new TypeError(`${path}.${key} is required in an object default`)
		}
	}

	const entries: [string, unknown][] = Object.entries(fields).map(
		([key, field]) => [
			key,
			snapshotFieldStaticValue(field, value[key], `${path}.${key}`),
		],
	)

	return immutableRecord(Object.fromEntries(entries))
}

/**
 * Creates immutable structured object metadata from existing field definitions.
 */
export function objectField<
	const TOptions extends {
		readonly fields: object
	},
>(
	options: TOptions &
		(ValidatedObjectOptions<NoInfer<TOptions>> extends never ? never : unknown),
): ObjectField<FieldsFromOptions<TOptions>, TOptions>

export function objectField(
	options: ObjectFieldOptions,
): ObjectField<ObjectFields, ObjectFieldOptions> {
	assertFieldOptionsObject(options)

	if (!isPlainRecord(options.fields)) {
		throw new TypeError('fields must be a field map')
	}

	assertValidTypeName(options.typeName)

	for (const [name, field] of Object.entries(options.fields)) {
		assertNonEmptyString(name, 'object field name')
		assertFieldDefinitionTree(field, `fields.${name}`)
	}

	const normalized = normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		(value, path) => snapshotObjectValue(value, options.fields, path),
	)

	// The field map is detached while reusable immutable child definitions keep identity.
	return immutableRecord({
		kind: 'object',
		options: immutableRecord({
			...normalized,
			fields: immutableRecord(options.fields),
		}),
	})
}

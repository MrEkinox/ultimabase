import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	assertValidTypeName,
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValue,
	GenericField,
	ValidatedFieldOptions,
} from './field.js'
import { isPlainRecord } from './runtime-value.js'

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

const isUnknownArray = (value: unknown): value is unknown[] =>
	Array.isArray(value)

const snapshotStructuredValue = (
	value: unknown,
	path: string,
	ancestors: WeakSet<object>,
): unknown => {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	) {
		return value
	}

	if (typeof value !== 'object') {
		throw new TypeError(`${path} must contain supported field values`)
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${path} must not contain circular references`)
	}

	ancestors.add(value)

	try {
		if (value instanceof Date) {
			const timestamp = value.getTime()

			if (!Number.isFinite(timestamp)) {
				throw new TypeError(`${path} must contain only valid Dates`)
			}

			return Object.freeze(new Date(timestamp))
		}

		if (isUnknownArray(value)) {
			const snapshot: unknown[] = value.map((item, index) =>
				snapshotStructuredValue(item, `${path}[${String(index)}]`, ancestors),
			)

			return immutableArray(snapshot)
		}

		if (!isPlainRecord(value)) {
			throw new TypeError(`${path} must contain only plain structured objects`)
		}

		const entries: [string, unknown][] = Object.entries(value).map(
			([key, item]) => [
				key,
				snapshotStructuredValue(item, `${path}.${key}`, ancestors),
			],
		)

		return immutableRecord(Object.fromEntries(entries))
	} finally {
		ancestors.delete(value)
	}
}

const assertAcyclicFieldTree = (
	value: unknown,
	path: string,
	ancestors: WeakSet<object>,
): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${path} must not contain circular field definitions`)
	}

	const { kind, options } = value

	if (typeof kind !== 'string' || !isPlainRecord(options)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	ancestors.add(value)

	try {
		if (kind === 'object') {
			if (!isPlainRecord(options.fields)) {
				throw new TypeError(`${path}.options.fields must be a field map`)
			}

			for (const [name, field] of Object.entries(options.fields)) {
				assertAcyclicFieldTree(
					field,
					`${path}.options.fields.${name}`,
					ancestors,
				)
			}
		}
	} finally {
		ancestors.delete(value)
	}
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
	assertValidTypeName(options.typeName)

	for (const [name, field] of Object.entries(options.fields)) {
		assertAcyclicFieldTree(field, `fields.${name}`, new WeakSet<object>())
	}

	const normalized = normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		(value, path) =>
			snapshotStructuredValue(value, path, new WeakSet<object>()),
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

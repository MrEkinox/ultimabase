import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	isStaticDefault,
	type DatabaseDefault,
	type DefaultFactory,
} from './default-value.js'
import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './field-options.js'
import type { FieldDefinition, FieldOptions, FieldValue } from './field.js'

interface GenericField {
	readonly kind: string
	readonly options: object
}

/**
 * Names the child fields of one structured object.
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
	}

/**
 * Carries a structured object value while leaving physical storage to adapters.
 */
export type ObjectField<
	TFields extends ObjectFields = ObjectFields,
	TOptions extends object = ObjectFieldOptions<TFields>,
> = FieldDefinition<'object', ObjectFieldValue<TFields>, TOptions>

/**
 * Keeps an element definition alongside the common array metadata.
 */
export type ArrayFieldOptions<TItem extends GenericField = GenericField> =
	FieldOptions<readonly FieldValue<TItem>[]> & {
		readonly items: TItem
	}

/**
 * Preserves the element value across arbitrary finite array nesting.
 */
export type ArrayField<
	TItem extends GenericField = GenericField,
	TOptions extends object = ArrayFieldOptions<TItem>,
> = FieldDefinition<'array', readonly FieldValue<TItem>[], TOptions>

type DefaultIsCompatible<TOptions, TValue> = TOptions extends {
	readonly default: infer TDefault
}
	? TDefault extends (...args: never[]) => unknown
		? TDefault extends DefaultFactory<TValue>
			? true
			: false
		: TDefault extends DatabaseDefault<TValue> | TValue
			? true
			: false
	: true

type ValidatedObjectOptions<TOptions extends { readonly fields: object }> =
	TOptions extends {
		readonly fields: infer TFields extends ObjectFields
	}
		? Omit<TOptions, 'default'> extends Omit<
				ObjectFieldOptions<TFields>,
				'default'
			>
			? DefaultIsCompatible<TOptions, ObjectFieldValue<TFields>> extends true
				? TOptions
				: never
			: never
		: never

type ValidatedArrayOptions<TOptions extends { readonly items: unknown }> =
	TOptions extends {
		readonly items: infer TItem extends GenericField
	}
		? Omit<TOptions, 'default'> extends Omit<
				ArrayFieldOptions<TItem>,
				'default'
			>
			? DefaultIsCompatible<TOptions, readonly FieldValue<TItem>[]> extends true
				? TOptions
				: never
			: never
		: never

type FieldsFromOptions<TOptions extends { readonly fields: object }> =
	TOptions extends {
		readonly fields: infer TFields extends ObjectFields
	}
		? TFields
		: ObjectFields

type ItemFromOptions<TOptions extends { readonly items: unknown }> =
	TOptions extends {
		readonly items: infer TItem extends GenericField
	}
		? TItem
		: GenericField

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

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

		if (!isUnknownRecord(value)) {
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

const snapshotStructuredDefault = <TValue>(value: TValue): TValue => {
	// The field type proves the recursive snapshot preserves the public value shape.
	return snapshotStructuredValue(
		value,
		'default',
		new WeakSet<object>(),
	) as TValue
}

const assertAcyclicFieldTree = (
	value: unknown,
	path: string,
	ancestors: WeakSet<object>,
): void => {
	if (!isUnknownRecord(value)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${path} must not contain circular field definitions`)
	}

	const { kind, options } = value

	if (typeof kind !== 'string' || !isUnknownRecord(options)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	ancestors.add(value)

	try {
		if (kind === 'array') {
			assertAcyclicFieldTree(options.items, `${path}.options.items`, ancestors)
		}

		if (kind === 'object') {
			if (!isUnknownRecord(options.fields)) {
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
	for (const [name, field] of Object.entries(options.fields)) {
		assertAcyclicFieldTree(field, `fields.${name}`, new WeakSet<object>())
	}

	const normalized = normalizeFieldOptions(options, normalizeFlatValidation)
	const defaultValue =
		normalized.default === undefined || !isStaticDefault(normalized.default)
			? undefined
			: snapshotStructuredDefault(normalized.default)

	// The map is copied while child definitions retain their immutable identity.
	return immutableRecord({
		kind: 'object',
		options: immutableRecord({
			...normalized,
			...(defaultValue === undefined ? {} : { default: defaultValue }),
			fields: immutableRecord(options.fields),
		}),
	})
}

/**
 * Creates immutable array metadata from one reusable field definition.
 */
export function arrayField<
	const TOptions extends {
		readonly items: unknown
	},
>(
	options: TOptions &
		(ValidatedArrayOptions<NoInfer<TOptions>> extends never ? never : unknown),
): ArrayField<ItemFromOptions<TOptions>, TOptions>

export function arrayField(
	options: ArrayFieldOptions,
): ArrayField<GenericField, ArrayFieldOptions> {
	assertAcyclicFieldTree(options.items, 'items', new WeakSet<object>())

	const normalized = normalizeFieldOptions(options, normalizeFlatValidation)
	const defaultValue =
		normalized.default === undefined || !isStaticDefault(normalized.default)
			? undefined
			: snapshotStructuredDefault(normalized.default)

	return immutableRecord({
		kind: 'array',
		options:
			defaultValue === undefined
				? normalized
				: immutableRecord({ ...normalized, default: defaultValue }),
	})
}

import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isStaticDefault } from './defaults.js'
import type { GenericField } from './contract.js'
import { assertPlainObject } from '../../../exact-object-validation.js'

/**
 * Reuses one exact empty option shape across zero-argument field factories.
 */
export type EmptyFieldOptions = Readonly<Record<PropertyKey, never>>

export const emptyFieldOptions: EmptyFieldOptions = immutableRecord({})

type NormalizeStaticValue = (value: unknown, path: string) => unknown

/** Lists the portable metadata keys shared by fields without a default contract. */
export const fieldOptionsBaseKeys: readonly string[] = [
	'description',
	'immutable',
	'indexed',
	'list',
	'required',
]

/** Lists the portable metadata keys shared by regular value fields. */
export const fieldOptionKeys: readonly string[] = [
	...fieldOptionsBaseKeys,
	'default',
	'nullable',
]

/** Describes every metadata key owned by one built-in field kind. */
export interface BuiltInFieldOptionsContract {
	readonly kind: string
	readonly optionKeys: readonly string[]
}

// Core-owned root names stay reserved even when one field kind does not support them.
const coreFieldOptionKeySet: ReadonlySet<string> = new Set([
	...fieldOptionKeys,
	'autoIncrement',
	'autoNow',
	'fields',
	'mappedBy',
	'onDelete',
	'precision',
	'scale',
	'target',
	'timezone',
	'typeName',
	'values',
	'where',
])

/** Identifies root option names reserved by at least one Core field contract. */
export const isCoreFieldOptionKey = (name: string): boolean =>
	coreFieldOptionKeySet.has(name)

/** Rejects symbol keys and Core-owned names that one built-in kind does not own. */
export const assertBuiltInFieldOptions = (
	options: Readonly<Record<string, unknown>>,
	contract: BuiltInFieldOptionsContract,
): void => {
	// Unknown string keys are retained until application compilation can resolve
	// them against option descriptors declared by installed plugins.
	for (const key of Reflect.ownKeys(options)) {
		if (
			typeof key !== 'string' ||
			(!contract.optionKeys.includes(key) && coreFieldOptionKeySet.has(key))
		) {
			throw new TypeError(
				`Unknown ${contract.kind} field option: ${String(key)}`,
			)
		}
	}
}

/** Ensures field factories and community plugins can safely read options. */
export function assertFieldOptions(
	options: unknown,
): asserts options is Readonly<Record<string, unknown>> {
	assertPlainObject(options, 'field options must be an object')
}

/**
 * Keeps neutral type identity validation independent from generator naming rules.
 */
export const assertValidTypeName = (typeName: unknown): void => {
	if (
		typeName !== undefined &&
		(typeof typeName !== 'string' || typeName.length === 0)
	) {
		throw new TypeError('typeName must be a non-empty string')
	}
}

/**
 * Returns the number of homogeneous list wrappers declared by field metadata.
 */
export const getFieldListDepth = (options: object): number => {
	// The flag is validated identically at declaration time and on later reads.
	const list = 'list' in options ? options.list : undefined

	if (list !== undefined && typeof list !== 'boolean') {
		throw new TypeError('list must be true or false')
	}

	return list === true ? 1 : 0
}

/**
 * Copies one scalar or nested list value through a field-specific snapshot function.
 */
export const snapshotListedFieldValue = (
	value: unknown,
	depth: number,
	normalizeStaticValue: NormalizeStaticValue,
	path: string,
): unknown => {
	if (depth === 0) {
		return normalizeStaticValue(value, path)
	}

	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be a list`)
	}

	return immutableArray(
		value.map((item, index) =>
			snapshotListedFieldValue(
				item,
				depth - 1,
				normalizeStaticValue,
				`${path}[${String(index)}]`,
			),
		),
	)
}

/** Reads direct required presence without trusting external metadata. */
const hasRequiredOption = (options: object): boolean =>
	'required' in options && options.required === true

/**
 * A default makes a field non-null; `nullable: true` beside it is the only way
 * back to `null` (ADR-0340). Without a default the option would say nothing.
 */
const assertNullableOption = (options: object): void => {
	const nullable = 'nullable' in options ? options.nullable : undefined
	assertOptionalBoolean(nullable, 'nullable')
	if (nullable === undefined) {
		return
	}

	if (!('default' in options)) {
		throw new TypeError('nullable is only accepted beside a default')
	}

	if (nullable && hasRequiredOption(options)) {
		throw new TypeError('required and nullable cannot both be true')
	}

	if (
		nullable &&
		'autoIncrement' in options &&
		options.autoIncrement === true
	) {
		throw new TypeError('autoIncrement and nullable cannot both be true')
	}
}

const assertCommonFieldMetadata = (options: object): void => {
	if ('required' in options) {
		assertOptionalBoolean(options.required, 'required')
	}

	assertNullableOption(options)

	if ('immutable' in options) {
		assertOptionalBoolean(options.immutable, 'immutable')
	}

	if (
		'indexed' in options &&
		options.indexed !== undefined &&
		typeof options.indexed !== 'boolean' &&
		options.indexed !== 'unique'
	) {
		throw new TypeError('indexed must be a boolean or "unique"')
	}

	if (
		'description' in options &&
		options.description !== undefined &&
		typeof options.description !== 'string'
	) {
		throw new TypeError('description must be a string')
	}
}

/**
 * Copies common field metadata while delegating primitive-specific validation.
 */
export const normalizeFieldOptions = <const TOptions extends object>(
	options: TOptions,
	normalizeStaticValue: NormalizeStaticValue,
	builtInContract?: BuiltInFieldOptionsContract,
): Readonly<TOptions> => {
	assertFieldOptions(options)

	if (builtInContract !== undefined) {
		assertBuiltInFieldOptions(options, builtInContract)
	}

	assertCommonFieldMetadata(options)

	const depth = getFieldListDepth(options)

	// A conditional spread preserves an absent default and replaces caller-owned
	// nested values; executable defaults stay untouched until object creation.
	return immutableRecord({
		...options,
		...('default' in options && isStaticDefault(options.default)
			? {
					default: snapshotListedFieldValue(
						options.default,
						depth,
						normalizeStaticValue,
						'default',
					),
				}
			: {}),
	})
}

/** Clock, sequence and plugin-generated values are supplied by the system. */
const hasGeneratedValue = (options: object): boolean =>
	('autoNow' in options && options.autoNow === true) ||
	('autoIncrement' in options && options.autoIncrement === true) ||
	'generatedOn' in options

/** Detects a declared list option without validating its value. */
export const hasListOption = (options: object): boolean =>
	'list' in options && options.list !== undefined && options.list !== false

/**
 * Derives whether a selected persisted field may contain logical null: a
 * required, defaulted or generated field may not, unless a defaulted field
 * declares `nullable: true` (ADR-0340).
 */
export const isFieldNullable = (field: GenericField): boolean =>
	('nullable' in field.options && field.options.nullable === true) ||
	(!hasRequiredOption(field.options) &&
		!('default' in field.options) &&
		!hasGeneratedValue(field.options))

/** Mirrors create-input omission rules at runtime snapshot boundaries. */
export const isRequiredOnCreate = (field: GenericField): boolean =>
	hasRequiredOption(field.options) &&
	!('default' in field.options) &&
	!hasGeneratedValue(field.options)

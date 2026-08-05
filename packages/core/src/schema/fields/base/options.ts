import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isStaticDefault } from './defaults.js'
import { defineExtensions } from '../../extensions/definition.js'
import type {
	FieldOptions,
	FieldValidationOptions,
	GenericField,
} from './contract.js'

/**
 * Reuses one exact empty option shape across zero-argument field factories.
 */
export type EmptyFieldOptions = Readonly<Record<PropertyKey, never>>

export const emptyFieldOptions: EmptyFieldOptions = immutableRecord({})

type NormalizeStaticValue = (value: unknown, path: string) => unknown

/** Ensures field factories and community plugins can safely read options. */
export function assertFieldOptions(
	options: unknown,
): asserts options is Readonly<Record<string, unknown>> {
	if (!isPlainRecord(options)) {
		throw new TypeError('field options must be an object')
	}
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

type NormalizedFieldList = false | readonly true[] | true | undefined

const invalidListMessage =
	'list must be true, false, or a non-empty list of true values'

/** Keeps list validation identical for declaration and later depth reads. */
const readFieldList = (list: unknown): NormalizedFieldList => {
	if (list === undefined || list === false || list === true) {
		return list
	}

	if (
		!isUnknownArray(list) ||
		list.length === 0 ||
		!list.every((entry): entry is true => entry === true)
	) {
		throw new TypeError(invalidListMessage)
	}

	return list
}

const normalizeList = (list: unknown): NormalizedFieldList => {
	const normalized = readFieldList(list)

	// A copied tuple prevents caller mutations from changing the declared list depth.
	return isUnknownArray(normalized) ? immutableArray(normalized) : normalized
}

const readListDepth = (list: NormalizedFieldList): number =>
	list === true ? 1 : isUnknownArray(list) ? list.length : 0

/**
 * Returns the number of homogeneous list wrappers declared by field metadata.
 */
export const getFieldListDepth = (options: object): number => {
	const list = readFieldList('list' in options ? options.list : undefined)

	return readListDepth(list)
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

/**
 * Freezes presence-only validation shared by primitive fields without extra constraints.
 */
export const normalizeFlatValidation = <
	const TValidation extends FieldValidationOptions,
>(
	validation: TValidation,
): Readonly<TValidation> => validation

const normalizeCommonValidation = <TValidation extends FieldValidationOptions>(
	validation: TValidation,
	normalizeValidation: (validation: TValidation) => Readonly<TValidation>,
): Readonly<TValidation> => {
	if (!isPlainRecord(validation)) {
		throw new TypeError('validation must be an object')
	}

	const normalized = normalizeValidation(validation)

	if (!isPlainRecord(normalized)) {
		throw new TypeError('normalized validation must be an object')
	}

	assertOptionalBoolean(normalized.required, 'validation.required')

	if ('nullable' in normalized) {
		throw new TypeError('validation.nullable is not supported')
	}

	// Schema owns the common shallow snapshot even when a plugin returns caller data.
	return immutableRecord(normalized)
}

const assertCommonFieldMetadata = (options: object): void => {
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
export const normalizeFieldOptions = <
	TValue,
	TValidation extends FieldValidationOptions,
	const TOptions extends FieldOptions<TValue, TValidation>,
>(
	options: TOptions,
	normalizeValidation: (validation: TValidation) => Readonly<TValidation>,
	normalizeStaticValue: NormalizeStaticValue,
): Readonly<TOptions> => {
	assertFieldOptions(options)

	assertCommonFieldMetadata(options)

	const list = normalizeList(options.list)
	const validation =
		options.validation === undefined
			? undefined
			: normalizeCommonValidation(options.validation, normalizeValidation)
	const extensions =
		options.extensions === undefined
			? undefined
			: defineExtensions(options.extensions)
	const hasNormalizedDefault =
		'default' in options && isStaticDefault(options.default)
	const normalizedDefault = hasNormalizedDefault
		? snapshotListedFieldValue(
				options.default,
				readListDepth(list),
				normalizeStaticValue,
				'default',
			)
		: undefined

	// Conditional spreads preserve absent options and replace caller-owned nested values.
	return immutableRecord({
		...options,
		...(list === undefined ? {} : { list }),
		...(validation === undefined ? {} : { validation }),
		...(extensions === undefined ? {} : { extensions }),
		...(hasNormalizedDefault ? { default: normalizedDefault } : {}),
	})
}

/** Reads required presence without trusting external metadata. */
const hasRequiredValidation = (options: object): boolean => {
	if (
		!('validation' in options) ||
		typeof options.validation !== 'object' ||
		options.validation === null
	) {
		return false
	}

	return (
		'required' in options.validation && options.validation.required === true
	)
}

/** Derives whether a selected persisted field may contain logical null. */
export const isFieldNullable = (field: GenericField): boolean =>
	!hasRequiredValidation(field.options) &&
	!('autoNow' in field.options && field.options.autoNow === true) &&
	!('autoIncrement' in field.options && field.options.autoIncrement === true) &&
	!('generatedOn' in field.options)

/** Mirrors create-input omission rules at runtime snapshot boundaries. */
export const isRequiredOnCreate = (field: GenericField): boolean =>
	hasRequiredValidation(field.options) &&
	!('default' in field.options) &&
	!('autoNow' in field.options && field.options.autoNow === true) &&
	!('autoIncrement' in field.options && field.options.autoIncrement === true) &&
	!('generatedOn' in field.options)

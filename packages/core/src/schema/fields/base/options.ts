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
	FieldTypegenState,
	FieldListOption,
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

/** Lists the portable metadata keys shared by fields without a default contract. */
export const fieldOptionsBaseKeys: readonly string[] = [
	'description',
	'extensions',
	'immutable',
	'indexed',
	'list',
	'validation',
]

/** Lists the portable metadata keys shared by regular value fields. */
export const fieldOptionKeys: readonly string[] = [
	...fieldOptionsBaseKeys,
	'default',
]

/** Lists the presence key shared by every built-in validation contract. */
export const fieldValidationOptionKeys: readonly string[] = ['required']

/** Lists the boundaries shared by ordered length, value, and temporal ranges. */
export const orderedRangeOptionKeys: readonly string[] = ['max', 'min']

/** Describes one nested record owned by a built-in validation contract. */
export interface BuiltInNestedValidationOptionsContract {
	readonly key: string
	readonly optionKeys: readonly string[]
}

/** Describes every metadata key owned by one built-in field kind. */
export interface BuiltInFieldOptionsContract {
	readonly kind: string
	readonly optionKeys: readonly string[]
	readonly validationOptionKeys: readonly string[]
	readonly nestedValidation?: readonly BuiltInNestedValidationOptionsContract[]
}

const formatOptionPath = (parent: string, key: PropertyKey): string => {
	const segment = String(key)

	return parent === '' ? segment : `${parent}.${segment}`
}

const assertKnownOptionKeys = (
	value: Readonly<Record<string, unknown>>,
	allowedKeys: readonly string[],
	kind: string,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !allowedKeys.includes(key)) {
			throw new TypeError(
				`Unknown ${kind} field option: ${formatOptionPath(path, key)}`,
			)
		}
	}
}

/** Rejects metadata that no built-in field normalizer owns. */
export const assertBuiltInFieldOptions = (
	options: Readonly<Record<string, unknown>>,
	contract: BuiltInFieldOptionsContract,
): void => {
	assertKnownOptionKeys(options, contract.optionKeys, contract.kind, '')

	if (!isPlainRecord(options.validation)) {
		return
	}

	// Nullability is an intentionally rejected legacy key, not an accidental typo.
	if (Object.hasOwn(options.validation, 'nullable')) {
		throw new TypeError('validation.nullable is not supported')
	}

	assertKnownOptionKeys(
		options.validation,
		contract.validationOptionKeys,
		contract.kind,
		'validation',
	)

	for (const nested of contract.nestedValidation ?? []) {
		const value = options.validation[nested.key]

		if (isPlainRecord(value)) {
			assertKnownOptionKeys(
				value,
				nested.optionKeys,
				contract.kind,
				`validation.${nested.key}`,
			)
		}
	}
}

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

type NormalizedFieldList = boolean | undefined

const invalidListMessage = 'list must be true or false'

/** Keeps list validation identical for declaration and later depth reads. */
const readFieldList = (list: unknown): NormalizedFieldList => {
	if (list === undefined || list === false || list === true) {
		return list
	}

	throw new TypeError(invalidListMessage)
}

const normalizeList = (list: unknown): NormalizedFieldList => {
	const normalized = readFieldList(list)

	return normalized
}

const readListDepth = (list: NormalizedFieldList): number =>
	list === true ? 1 : 0

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
	builtInContract?: BuiltInFieldOptionsContract,
): Readonly<TOptions> => {
	assertFieldOptions(options)

	if (builtInContract !== undefined) {
		assertBuiltInFieldOptions(options, builtInContract)
	}

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

/**
 * Reads the compact runtime inference facts used by deterministic type generation.
 *
 * Keeping this derivation in Schema prevents generators from duplicating the
 * required, generated, immutable, nullable, and list-presence rules.
 */
export const readFieldTypegenState = (
	field: GenericField,
): FieldTypegenState => {
	const normalizedList = normalizeList(
		'list' in field.options ? field.options.list : undefined,
	)
	const list: FieldListOption = normalizedList ?? false
	const generated = 'generatedOn' in field.options
	const relation = field.kind === 'relation'

	return immutableRecord({
		create: relation
			? 'forbidden'
			: generated
				? 'forbidden'
				: isRequiredOnCreate(field)
					? 'required'
					: 'optional',
		list,
		nullable: relation ? false : isFieldNullable(field),
		object: relation ? 'forbidden' : 'required',
		update:
			relation ||
			generated ||
			('immutable' in field.options && field.options.immutable === true)
				? 'forbidden'
				: 'optional',
	})
}

import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isStaticDefault } from './defaults.js'
import type { FieldOptions, GenericField } from './contract.js'

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
]

/** Describes every metadata key owned by one built-in field kind. */
export interface BuiltInFieldOptionsContract {
	readonly kind: string
	readonly optionKeys: readonly string[]
}

const builtInContractsByOptions = new WeakMap<
	object,
	BuiltInFieldOptionsContract
>()

/** Reads the exact Core-owned root keys recorded by a built-in field factory. */
export const getBuiltInFieldOptionsContract = (
	options: object,
): BuiltInFieldOptionsContract | undefined =>
	builtInContractsByOptions.get(options)

const assertStringOptionKeys = (
	value: Readonly<Record<string, unknown>>,
	contract: BuiltInFieldOptionsContract,
): void => {
	for (const key of Reflect.ownKeys(value)) {
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

/** Rejects metadata that no built-in field normalizer owns. */
export const assertBuiltInFieldOptions = (
	options: Readonly<Record<string, unknown>>,
	contract: BuiltInFieldOptionsContract,
): void => {
	// Unknown string keys are retained until application compilation can resolve
	// them against option descriptors declared by installed plugins.
	assertStringOptionKeys(options, contract)
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

const assertCommonFieldMetadata = (options: object): void => {
	if ('required' in options) {
		assertOptionalBoolean(options.required, 'required')
	}

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
	const TOptions extends FieldOptions<TValue>,
>(
	options: TOptions,
	normalizeStaticValue: NormalizeStaticValue,
	builtInContract?: BuiltInFieldOptionsContract,
): Readonly<TOptions> => {
	assertFieldOptions(options)

	if (builtInContract !== undefined) {
		assertBuiltInFieldOptions(options, builtInContract)
	}

	assertCommonFieldMetadata(options)

	const list = normalizeList(options.list)
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
	const normalized = immutableRecord({
		...options,
		...(list === undefined ? {} : { list }),
		...(hasNormalizedDefault ? { default: normalizedDefault } : {}),
	})

	if (builtInContract !== undefined) {
		builtInContractsByOptions.set(normalized, builtInContract)
	}

	return normalized
}

/** Reads direct required presence without trusting external metadata. */
const hasRequiredOption = (options: object): boolean =>
	'required' in options && options.required === true

/** Derives whether a selected persisted field may contain logical null. */
export const isFieldNullable = (field: GenericField): boolean =>
	!hasRequiredOption(field.options) &&
	!('autoNow' in field.options && field.options.autoNow === true) &&
	!('autoIncrement' in field.options && field.options.autoIncrement === true) &&
	!('generatedOn' in field.options)

/** Mirrors create-input omission rules at runtime snapshot boundaries. */
export const isRequiredOnCreate = (field: GenericField): boolean =>
	hasRequiredOption(field.options) &&
	!('default' in field.options) &&
	!('autoNow' in field.options && field.options.autoNow === true) &&
	!('autoIncrement' in field.options && field.options.autoIncrement === true) &&
	!('generatedOn' in field.options)

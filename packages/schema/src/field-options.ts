import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { isStaticDefault } from './default-value.js'
import { defineExtensions } from './extension.js'
import type { FieldOptions, FieldValidationOptions } from './field.js'

type NormalizeStaticValue = (value: unknown, path: string) => unknown

const preserveStaticValue: NormalizeStaticValue = (value) => value

const isUnknownArray = (value: unknown): value is unknown[] =>
	Array.isArray(value)

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

const normalizeList = (
	list: unknown,
): false | readonly true[] | true | undefined => {
	if (list === undefined || list === false || list === true) {
		return list
	}

	if (!isUnknownArray(list) || list.length === 0) {
		throw new TypeError(
			'list must be true, false, or a non-empty list of true values',
		)
	}

	const depth: true[] = []

	for (const entry of list) {
		if (entry !== true) {
			throw new TypeError(
				'list must be true, false, or a non-empty list of true values',
			)
		}

		depth.push(entry)
	}

	// A copied tuple prevents caller mutations from changing the declared list depth.
	return immutableArray(depth)
}

/**
 * Returns the number of homogeneous list wrappers declared by field metadata.
 */
export const getFieldListDepth = (options: object): number => {
	if (
		!('list' in options) ||
		options.list === undefined ||
		options.list === false
	) {
		return 0
	}

	if (options.list === true) {
		return 1
	}

	if (isUnknownArray(options.list)) {
		return options.list.length
	}

	throw new TypeError(
		'list must be true, false, or a non-empty list of true values',
	)
}

/**
 * Copies one scalar or nested list value through a field-specific snapshot function.
 */
export const snapshotFieldValue = (
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
			snapshotFieldValue(
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
): Readonly<TValidation> => immutableRecord(validation)

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
	normalizeStaticValue: NormalizeStaticValue = preserveStaticValue,
): Readonly<TOptions> => {
	const list = normalizeList(options.list)
	const validation =
		options.validation === undefined
			? undefined
			: normalizeValidation(options.validation)
	const extensions =
		options.extensions === undefined
			? undefined
			: defineExtensions(options.extensions)
	const normalizedDefault =
		'default' in options && isStaticDefault(options.default)
			? snapshotFieldValue(
					options.default,
					getFieldListDepth({ list }),
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
		...(normalizedDefault === undefined ? {} : { default: normalizedDefault }),
	})
}

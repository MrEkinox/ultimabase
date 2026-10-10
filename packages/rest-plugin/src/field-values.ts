import {
	Schema,
	getFieldListDepth,
	getFieldSchemaTarget,
	getPluginFieldWireCodec,
	transformQueryFilterInput,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { invalidRestRead } from './errors.js'
import { restFieldProtocol } from './field-codecs.js'

const bigintPattern = /^(?:0|-?[1-9]\d*)$/u
const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const base64Pattern =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

export type InvalidRestValue = () => Error

/**
 * Selects the logical form of a tagged pointer: reads compare identities while
 * mutation data carries Core `Pointer` values.
 */
type PointerMode = 'identity' | 'value'

export const isUuidV7 = (value: unknown): value is string =>
	typeof value === 'string' && uuidV7Pattern.test(value)

/** @internal Maps own entries by plain assignment into one frozen copy. */
export const mapRestRecord = (
	value: Readonly<Record<string, unknown>>,
	map: (name: string, item: unknown) => unknown,
): Readonly<Record<string, unknown>> => {
	const mapped: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(value))
		mapped[name] = map(name, item)
	return immutableRecord(mapped)
}

/** @internal Resolves embedded field metadata for both REST codec directions. */
export const readRestObjectFields = (
	field: GenericField,
	invalid: InvalidRestValue,
): Readonly<Record<string, GenericField>> => {
	const options: unknown = field.options
	const fields = isPlainRecord(options) ? options.fields : undefined
	if (!isPlainRecord(fields)) throw invalid()
	return fields as Readonly<Record<string, GenericField>>
}

const decodeBinary = (
	value: unknown,
	invalid: InvalidRestValue,
): Uint8Array => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 3 ||
		value.type !== 'binary' ||
		value.encoding !== 'base64' ||
		typeof value.data !== 'string' ||
		!base64Pattern.test(value.data)
	) {
		throw invalid()
	}
	return new Uint8Array(Buffer.from(value.data, 'base64'))
}

const decodePointer = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	pointerMode: PointerMode,
): unknown => {
	const target = getFieldSchemaTarget(field)?.()
	if (
		target === undefined ||
		!isPlainRecord(value) ||
		Object.keys(value).length !== 3 ||
		value.type !== 'pointer' ||
		value.className !== target.className ||
		!isUuidV7(value.id)
	) {
		throw invalid()
	}
	if (pointerMode === 'identity') return value.id
	// Its schema creates every Pointer (ADR-0314).
	if (!Schema.is(target)) throw invalid()
	return target.pointer(value.id)
}

const decodeScalar = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	pointerMode: PointerMode,
): unknown => {
	switch (field.kind) {
		case 'bigint':
			if (typeof value !== 'string' || !bigintPattern.test(value)) {
				throw invalid()
			}
			return BigInt(value)
		case 'binary':
			return decodeBinary(value, invalid)
		case 'pointer':
			return decodePointer(field, value, invalid, pointerMode)
		case 'uuid':
			if (typeof value !== 'string' || !uuidPattern.test(value)) {
				throw invalid()
			}
			return value
		case 'object': {
			if (!isPlainRecord(value)) throw invalid()
			const fields = readRestObjectFields(field, invalid)
			return mapRestRecord(value, (name, item) => {
				const child = fields[name]
				if (child === undefined) throw invalid()
				return decodeRestFieldValue(child, item, invalid, pointerMode)
			})
		}
		case 'relation':
			throw invalid()
	}
	if (!field.kind.includes('.')) return value
	const codec = getPluginFieldWireCodec(field, restFieldProtocol)
	if (codec === undefined) throw invalid()
	try {
		return codec.decode(value)
	} catch {
		throw invalid()
	}
}

/** @internal Walks declared list levels, keeping `null`, before one leaf codec. */
export const mapRestListDepth = (
	value: unknown,
	depth: number,
	invalid: InvalidRestValue,
	leaf: (item: unknown) => unknown,
): unknown => {
	if (value === null) return null
	if (depth <= 0) return leaf(value)
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(
		value.map((item) => mapRestListDepth(item, depth - 1, invalid, leaf)),
	)
}

/** Decodes one complete schema field value using its exact REST v1 contract. */
export const decodeRestFieldValue = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	pointerMode: PointerMode = 'identity',
): unknown =>
	mapRestListDepth(value, getFieldListDepth(field.options), invalid, (item) =>
		decodeScalar(field, item, invalid, pointerMode),
	)

/** Decodes one element operand for a list field without erasing nested depth. */
const decodeRestListElement = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown =>
	mapRestListDepth(
		value,
		getFieldListDepth(field.options) - 1,
		invalid,
		(item) => decodeScalar(field, item, invalid, 'identity'),
	)

const untouchedOperators = new Set([
	'count',
	'hasAllKeys',
	'hasAnyKeys',
	'hasKey',
	'isEmpty',
	'isNotEmpty',
	'isNotNull',
	'isNull',
	'matches',
])

const relationshipOperators = new Set(['every', 'is', 'isNot', 'none', 'some'])

const decodeOperand = (
	field: GenericField,
	operator: string,
	value: unknown,
): unknown => {
	const decode = (item: unknown): unknown =>
		decodeRestFieldValue(field, item, invalidRestRead)
	const decodeElement = (item: unknown): unknown =>
		decodeRestListElement(field, item, invalidRestRead)
	const decodeEach = (decodeItem: (item: unknown) => unknown): unknown => {
		if (!isUnknownArray(value)) throw invalidRestRead()
		return immutableArray(value.map((item) => decodeItem(item)))
	}
	switch (operator) {
		case 'between':
		case 'notBetween':
			if (
				!isPlainRecord(value) ||
				Object.keys(value).length !== 2 ||
				!Object.hasOwn(value, 'lower') ||
				!Object.hasOwn(value, 'upper')
			) {
				throw invalidRestRead()
			}
			return immutableRecord({
				lower: decode(value.lower),
				upper: decode(value.upper),
			})
		case 'in':
		case 'notIn':
			return decodeEach(decode)
		case 'has':
			return decodeElement(value)
		case 'hasSome':
		case 'hasEvery':
			return decodeEach(decodeElement)
		case 'contains':
			// JSON and plugin containment operands keep their logical JSON shape.
			return field.kind === 'json' || field.kind.includes('.')
				? value
				: decode(value)
	}
	return untouchedOperators.has(operator) ? value : decode(value)
}

/**
 * Decodes filter field values while leaving operator validity to Core
 * normalization. A pointer's equality shorthand is its target id (ADR-0307),
 * since the tagged pointer object would read as an operator object.
 */
export const decodeRestWhere = (
	schema: SchemaDefinition,
	value: unknown,
): unknown =>
	transformQueryFilterInput(
		schema,
		value,
		({ field, operator, source, value }) => {
			if (source === 'shorthand' && field.kind === 'pointer') {
				if (!isUuidV7(value)) throw invalidRestRead()
				return value
			}
			return relationshipOperators.has(operator) &&
				getFieldSchemaTarget(field) === undefined
				? value
				: decodeOperand(field, operator, value)
		},
	)

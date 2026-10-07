import {
	Pointer,
	getFieldListDepth,
	getFieldSchemaTarget,
	getPluginFieldWireCodec,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { restFieldProtocol } from './field-codecs.js'

const bigintPattern = /^(?:0|-?[1-9]\d*)$/u
const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const base64Pattern =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

export type InvalidRestValue = () => Error

export const isUuidV7 = (value: unknown): value is string =>
	typeof value === 'string' && uuidV7Pattern.test(value)

/** @internal Resolves embedded field metadata for both REST codec directions. */
export const readRestObjectFields = (
	field: GenericField,
	invalid: InvalidRestValue,
): Readonly<Record<string, GenericField>> => {
	const options: unknown = field.options
	if (!isPlainRecord(options)) throw invalid()
	const fields = options.fields
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

	try {
		return Uint8Array.from(globalThis.atob(value.data), (character) =>
			character.charCodeAt(0),
		)
	} catch {
		throw invalid()
	}
}

const decodePointerIdentity = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<{ id: string; target: SchemaDefinition }> => {
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
	return { id: value.id, target }
}

const decodeObject = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	partial: boolean,
	pointerMode: 'identity' | 'value',
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) throw invalid()
	const fields = readRestObjectFields(field, invalid)
	const decoded: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(value)) {
		const child = fields[name]
		if (child === undefined) throw invalid()
		decoded[name] = decodeRestFieldValue(
			child,
			item,
			invalid,
			partial,
			pointerMode,
		)
	}
	return immutableRecord(decoded)
}

const decodeScalar = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	partial: boolean,
	pointerMode: 'identity' | 'value',
): unknown => {
	if (value === null) return null
	if (field.kind === 'bigint') {
		if (typeof value !== 'string' || !bigintPattern.test(value)) {
			throw invalid()
		}
		return BigInt(value)
	}
	if (field.kind === 'binary') return decodeBinary(value, invalid)
	if (field.kind === 'pointer') {
		const pointer = decodePointerIdentity(field, value, invalid)
		return pointerMode === 'identity'
			? pointer.id
			: new Pointer(pointer.target, pointer.id)
	}
	if (field.kind === 'uuid') {
		if (typeof value !== 'string' || !uuidPattern.test(value)) {
			throw invalid()
		}
		return value
	}
	if (field.kind === 'object') {
		return decodeObject(field, value, invalid, partial, pointerMode)
	}
	if (field.kind === 'relation') throw invalid()
	if (field.kind.includes('.')) {
		const codec = getPluginFieldWireCodec(field, restFieldProtocol)
		if (codec === undefined) throw invalid()
		try {
			return codec.decode(value)
		} catch {
			throw invalid()
		}
	}
	return value
}

const decodeAtDepth = (
	field: GenericField,
	value: unknown,
	depth: number,
	invalid: InvalidRestValue,
	partial: boolean,
	pointerMode: 'identity' | 'value',
): unknown => {
	if (value === null) return null
	if (depth === 0) {
		return decodeScalar(field, value, invalid, partial, pointerMode)
	}
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(
		value.map((item) =>
			decodeAtDepth(field, item, depth - 1, invalid, partial, pointerMode),
		),
	)
}

/** Decodes one complete schema field value using its exact REST v1 contract. */
export const decodeRestFieldValue = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
	partial = false,
	pointerMode: 'identity' | 'value' = 'identity',
): unknown =>
	decodeAtDepth(
		field,
		value,
		getFieldListDepth(field.options),
		invalid,
		partial,
		pointerMode,
	)

/** Decodes one element operand for a list field without erasing nested depth. */
export const decodeRestListElement = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	const depth = getFieldListDepth(field.options)
	return decodeAtDepth(
		field,
		value,
		Math.max(0, depth - 1),
		invalid,
		false,
		'identity',
	)
}

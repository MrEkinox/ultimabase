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
import { readRestObjectFields, type InvalidRestValue } from './field-values.js'

const encodeBinary = (value: unknown, invalid: InvalidRestValue): unknown => {
	if (!(value instanceof Uint8Array)) throw invalid()
	let binary = ''
	for (const byte of value) binary += String.fromCharCode(byte)
	return immutableRecord({
		type: 'binary' as const,
		encoding: 'base64' as const,
		data: globalThis.btoa(binary),
	})
}

const readModelValues = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> => {
	if (typeof value !== 'object' || value === null) throw invalid()
	if (Object.getPrototypeOf(value) !== Reflect.get(schema, 'prototype')) {
		throw invalid()
	}
	const toJSON: unknown = Reflect.get(value, 'toJSON')
	if (typeof toJSON !== 'function') throw invalid()
	const values: unknown = Reflect.apply(toJSON, value, [])
	if (!isPlainRecord(values)) throw invalid()
	return values
}

const encodeJsonValue = (
	value: unknown,
	invalid: InvalidRestValue,
	seen: Set<object>,
): unknown => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return value
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw invalid()
		return value
	}
	if (isUnknownArray(value)) {
		if (seen.has(value)) throw invalid()
		seen.add(value)
		const encoded = immutableArray(
			value.map((item) => encodeJsonValue(item, invalid, seen)),
		)
		seen.delete(value)
		return encoded
	}
	if (!isPlainRecord(value) || seen.has(value)) throw invalid()
	seen.add(value)
	const encoded: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(value)) {
		encoded[name] = encodeJsonValue(item, invalid, seen)
	}
	seen.delete(value)
	return immutableRecord(encoded)
}

const encodeSchemaRecord = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> => {
	const values = readModelValues(schema, value, invalid)
	const encoded: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(values)) {
		const field = schema.fields[name]
		if (field === undefined) throw invalid()
		encoded[name] = encodeRestFieldValue(field, item, invalid)
	}
	return immutableRecord(encoded)
}

const encodeObject = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (!isPlainRecord(value)) throw invalid()
	const fields = readRestObjectFields(field, invalid)
	const encoded: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(value)) {
		const child = fields[name]
		if (child === undefined) throw invalid()
		encoded[name] = encodeRestFieldValue(child, item, invalid)
	}
	return immutableRecord(encoded)
}

const encodeRelationship = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	const target = getFieldSchemaTarget(field)?.()
	if (target === undefined) throw invalid()
	if (field.kind === 'pointer') {
		if (Pointer.is(value)) return value.toJSON()
		return encodeSchemaRecord(target, value, invalid)
	}
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(
		value.map((item) => encodeSchemaRecord(target, item, invalid)),
	)
}

const encodeScalar = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (value === null) return null
	if (field.kind === 'bigint') {
		if (typeof value !== 'bigint') throw invalid()
		return value.toString(10)
	}
	if (field.kind === 'binary') return encodeBinary(value, invalid)
	if (field.kind === 'pointer' || field.kind === 'relation') {
		return encodeRelationship(field, value, invalid)
	}
	if (field.kind === 'object') return encodeObject(field, value, invalid)
	if (field.kind.includes('.')) {
		const codec = getPluginFieldWireCodec(field, restFieldProtocol)
		if (codec === undefined) throw invalid()
		try {
			return encodeJsonValue(codec.encode(value), invalid, new Set())
		} catch {
			throw invalid()
		}
	}
	if (field.kind === 'json') {
		return encodeJsonValue(value, invalid, new Set())
	}
	if (field.kind === 'float') {
		if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid()
		return value
	}
	if (field.kind === 'int') {
		if (typeof value !== 'number' || !Number.isSafeInteger(value))
			throw invalid()
		return value
	}
	if (field.kind === 'boolean') {
		if (typeof value !== 'boolean') throw invalid()
		return value
	}
	if (
		field.kind === 'date' ||
		field.kind === 'dateTime' ||
		field.kind === 'decimal' ||
		field.kind === 'enum' ||
		field.kind === 'string' ||
		field.kind === 'time' ||
		field.kind === 'uuid'
	) {
		if (typeof value !== 'string') throw invalid()
		return value
	}
	throw invalid()
}

const encodeAtDepth = (
	field: GenericField,
	value: unknown,
	depth: number,
	invalid: InvalidRestValue,
): unknown => {
	if (value === null) return null
	if (depth === 0) return encodeScalar(field, value, invalid)
	if (!isUnknownArray(value)) throw invalid()
	return immutableArray(
		value.map((item) => encodeAtDepth(field, item, depth - 1, invalid)),
	)
}

/** Encodes one complete schema field value using its exact REST v1 contract. */
export const encodeRestFieldValue = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown =>
	encodeAtDepth(field, value, getFieldListDepth(field.options), invalid)

/** Encodes one trusted Runtime model without inventing fields for absent values. */
export const encodeRestSchemaResult = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> =>
	encodeSchemaRecord(schema, value, invalid)

/** Revalidates operation wire output before JSON serialization. */
export const encodeRestJsonValue = (
	value: unknown,
	invalid: InvalidRestValue,
): unknown => encodeJsonValue(value, invalid, new Set())

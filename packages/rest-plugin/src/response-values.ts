import {
	Pointer,
	getFieldListDepth,
	getFieldSchemaTarget,
	getPluginFieldWireCodec,
	type GenericField,
	type CompiledSchemaRegistry,
	type GenericOutputDescriptor,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { restFieldProtocol } from './field-codecs.js'
import {
	mapRestListDepth,
	mapRestRecord,
	readRestObjectFields,
	type InvalidRestValue,
} from './field-values.js'

const isString = (value: unknown): boolean => typeof value === 'string'

// Built-in scalars whose canonical REST value is the logical value itself.
const passThroughScalars: ReadonlyMap<string, (value: unknown) => boolean> =
	new Map([
		['boolean', (value: unknown) => typeof value === 'boolean'],
		[
			'float',
			(value: unknown) => typeof value === 'number' && Number.isFinite(value),
		],
		['int', (value: unknown) => Number.isSafeInteger(value)],
		['date', isString],
		['dateTime', isString],
		['decimal', isString],
		['enum', isString],
		['string', isString],
		['time', isString],
		['uuid', isString],
	])

const encodedKinds = new Set(['bigint', 'binary', 'json', 'object'])

/** @internal Lists the built-in output kinds that have an exact REST v1 encoding. */
export const isRestOutputKind = (kind: string): boolean =>
	passThroughScalars.has(kind) || encodedKinds.has(kind)

const readModelValues = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> => {
	if (typeof value !== 'object' || value === null) throw invalid()
	const prototype: unknown = Reflect.get(schema, 'prototype')
	if (
		typeof prototype !== 'object' ||
		prototype === null ||
		Object.getPrototypeOf(value) !== prototype
	) {
		throw invalid()
	}
	const toJSON: unknown = Reflect.get(prototype, 'toJSON')
	const toPointer: unknown = Reflect.get(prototype, 'toPointer')
	if (typeof toJSON !== 'function' || typeof toPointer !== 'function') {
		throw invalid()
	}
	const pointer: unknown = Reflect.apply(toPointer, value, [])
	if (!Pointer.is(pointer) || pointer.schema !== schema) throw invalid()
	const values: unknown = Reflect.apply(toJSON, value, [])
	if (!isPlainRecord(values)) throw invalid()
	return values
}

const encodeJsonValue = (
	value: unknown,
	invalid: InvalidRestValue,
	schemas: CompiledSchemaRegistry | undefined,
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
	if (!isUnknownArray(value) && !isPlainRecord(value)) {
		// Only this application's models use schema codecs; JSON fields remain JSON.
		const schema =
			typeof value === 'object'
				? schemas
						?.values()
						.find(
							(candidate) =>
								Object.getPrototypeOf(value) ===
								Reflect.get(candidate, 'prototype'),
						)
				: undefined
		if (schema === undefined) throw invalid()
		return encodeRestSchemaResult(schema, value, invalid)
	}
	if (seen.has(value)) throw invalid()
	seen.add(value)
	const encodeItem = (item: unknown): unknown =>
		encodeJsonValue(item, invalid, schemas, seen)
	const encoded = isUnknownArray(value)
		? immutableArray(value.map(encodeItem))
		: mapRestRecord(value, (_name, item) => encodeItem(item))
	seen.delete(value)
	return encoded
}

const encodeBuiltInScalar = (
	kind: string,
	value: unknown,
	invalid: InvalidRestValue,
	encodeObject: () => unknown,
): unknown => {
	if (value === null) return null
	const isValid = passThroughScalars.get(kind)
	if (isValid !== undefined) {
		if (!isValid(value)) throw invalid()
		return value
	}
	switch (kind) {
		case 'bigint':
			if (typeof value !== 'bigint') throw invalid()
			return value.toString(10)
		case 'binary':
			if (!(value instanceof Uint8Array)) throw invalid()
			return immutableRecord({
				type: 'binary' as const,
				encoding: 'base64' as const,
				data: Buffer.from(value).toString('base64'),
			})
		case 'object':
			return encodeObject()
		case 'json':
			return encodeJsonValue(value, invalid, undefined, new Set())
	}
	throw invalid()
}

/** Encodes one output-only value through the same canonical REST shapes. */
const encodeRestOutputValue = (
	descriptor: GenericOutputDescriptor,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	const encodeItem = (item: unknown): unknown =>
		encodeBuiltInScalar(descriptor.kind, item, invalid, () => {
			if (!isPlainRecord(item)) throw invalid()
			const options: unknown = descriptor.options
			const fields = isPlainRecord(options) ? options.fields : undefined
			if (!isPlainRecord(fields)) throw invalid()
			return mapRestRecord(item, (name, child) => {
				const output: unknown = fields[name]
				if (typeof output !== 'object' || output === null) throw invalid()
				// Core compiled this nested output descriptor with the virtual field.
				return encodeRestOutputValue(
					output as GenericOutputDescriptor,
					child,
					invalid,
				)
			})
		})
	return mapRestListDepth(
		value,
		descriptor.options.list ? 1 : 0,
		invalid,
		encodeItem,
	)
}

const encodeScalar = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown => {
	if (field.kind === 'pointer' || field.kind === 'relation') {
		const target = getFieldSchemaTarget(field)?.()
		if (target === undefined) throw invalid()
		if (field.kind === 'pointer') {
			return Pointer.is(value)
				? value.toJSON()
				: encodeRestSchemaResult(target, value, invalid)
		}
		if (!isUnknownArray(value)) throw invalid()
		return immutableArray(
			value.map((item) => encodeRestSchemaResult(target, item, invalid)),
		)
	}
	if (field.kind.includes('.')) {
		const codec = getPluginFieldWireCodec(field, restFieldProtocol)
		if (codec === undefined) throw invalid()
		try {
			return encodeJsonValue(codec.encode(value), invalid, undefined, new Set())
		} catch {
			throw invalid()
		}
	}
	return encodeBuiltInScalar(field.kind, value, invalid, () => {
		if (!isPlainRecord(value)) throw invalid()
		const fields = readRestObjectFields(field, invalid)
		return mapRestRecord(value, (name, item) => {
			const child = fields[name]
			if (child === undefined) throw invalid()
			return encodeRestFieldValue(child, item, invalid)
		})
	})
}

/** Encodes one complete schema field value using its exact REST v1 contract. */
const encodeRestFieldValue = (
	field: GenericField,
	value: unknown,
	invalid: InvalidRestValue,
): unknown =>
	mapRestListDepth(value, getFieldListDepth(field.options), invalid, (item) =>
		encodeScalar(field, item, invalid),
	)

/** Encodes one trusted Runtime model without inventing fields for absent values. */
export const encodeRestSchemaResult = (
	schema: SchemaDefinition,
	value: unknown,
	invalid: InvalidRestValue,
): Readonly<Record<string, unknown>> =>
	mapRestRecord(readModelValues(schema, value, invalid), (name, item) => {
		const virtual = schema.virtualFields[name]
		if (virtual !== undefined) {
			return encodeRestOutputValue(virtual.output, item, invalid)
		}
		const field = schema.persistedFields[name]
		if (field === undefined) throw invalid()
		return encodeRestFieldValue(field, item, invalid)
	})

/** Revalidates operation wire output before JSON serialization. */
export const encodeRestJsonValue = (
	value: unknown,
	invalid: InvalidRestValue,
	schemas?: CompiledSchemaRegistry,
): unknown => encodeJsonValue(value, invalid, schemas, new Set())

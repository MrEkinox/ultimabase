import {
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

import { invalidRestRead } from './errors.js'
import { restFieldProtocol } from './field-codecs.js'

const bigintPattern = /^(?:0|-?[1-9]\d*)$/u
const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const base64Pattern =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

export const isUuidV7 = (value: unknown): value is string =>
	typeof value === 'string' && uuidV7Pattern.test(value)

const objectChildFields = (
	field: GenericField,
): Readonly<Record<string, GenericField>> => {
	const options: unknown = field.options
	if (!isPlainRecord(options)) throw invalidRestRead()
	const fields = options.fields
	if (!isPlainRecord(fields)) throw invalidRestRead()
	return fields as Readonly<Record<string, GenericField>>
}

const decodeBinary = (value: unknown): Uint8Array => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 3 ||
		value.type !== 'binary' ||
		value.encoding !== 'base64' ||
		typeof value.data !== 'string' ||
		!base64Pattern.test(value.data)
	) {
		throw invalidRestRead()
	}

	try {
		return Uint8Array.from(globalThis.atob(value.data), (character) =>
			character.charCodeAt(0),
		)
	} catch {
		throw invalidRestRead()
	}
}

const decodePointer = (field: GenericField, value: unknown): string => {
	const target = getFieldSchemaTarget(field)?.()
	if (
		target === undefined ||
		!isPlainRecord(value) ||
		Object.keys(value).length !== 3 ||
		value.type !== 'pointer' ||
		value.className !== target.className ||
		!isUuidV7(value.id)
	) {
		throw invalidRestRead()
	}
	return value.id
}

const decodeObject = (
	field: GenericField,
	value: unknown,
	partial: boolean,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) throw invalidRestRead()
	const fields = objectChildFields(field)
	const decoded: Record<string, unknown> = {}
	for (const [name, item] of Object.entries(value)) {
		const child = fields[name]
		if (child === undefined) throw invalidRestRead()
		decoded[name] = decodeFieldValue(child, item, partial)
	}
	return immutableRecord(decoded)
}

const decodeScalar = (
	field: GenericField,
	value: unknown,
	partial: boolean,
): unknown => {
	if (value === null) return null
	if (field.kind === 'bigint') {
		if (typeof value !== 'string' || !bigintPattern.test(value)) {
			throw invalidRestRead()
		}
		return BigInt(value)
	}
	if (field.kind === 'binary') return decodeBinary(value)
	if (field.kind === 'pointer') return decodePointer(field, value)
	if (field.kind === 'uuid') {
		if (typeof value !== 'string' || !uuidPattern.test(value)) {
			throw invalidRestRead()
		}
		return value
	}
	if (field.kind === 'object') return decodeObject(field, value, partial)
	if (field.kind === 'relation') throw invalidRestRead()
	if (field.kind.includes('.')) {
		const codec = getPluginFieldWireCodec(field, restFieldProtocol)
		if (codec === undefined) throw invalidRestRead()
		try {
			return codec.decode(value)
		} catch {
			throw invalidRestRead()
		}
	}
	return value
}

const decodeFieldValue = (
	field: GenericField,
	value: unknown,
	partial = false,
): unknown => {
	if (value === null) return null
	const depth = getFieldListDepth(field.options)
	if (depth === 0) return decodeScalar(field, value, partial)
	if (!isUnknownArray(value)) throw invalidRestRead()
	return immutableArray(value.map((item) => decodeScalar(field, item, partial)))
}

const decodeListElement = (field: GenericField, value: unknown): unknown =>
	decodeScalar(field, value, false)

const decodeRange = (
	field: GenericField,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 2 ||
		!Object.hasOwn(value, 'lower') ||
		!Object.hasOwn(value, 'upper')
	) {
		throw invalidRestRead()
	}
	return immutableRecord({
		lower: decodeFieldValue(field, value.lower),
		upper: decodeFieldValue(field, value.upper),
	})
}

const untouchedOperators = new Set([
	'count',
	'hasAllKeys',
	'hasAnyKeys',
	'hasKey',
	'isEmpty',
	'isNotEmpty',
	'isNotNull',
	'isNull',
	'jsonPathExists',
	'jsonPathMatches',
	'matches',
])

const decodeOperator = (
	field: GenericField,
	operator: string,
	value: unknown,
): unknown => {
	if (operator === 'between' || operator === 'notBetween') {
		return decodeRange(field, value)
	}
	if (operator === 'in' || operator === 'notIn') {
		if (!isUnknownArray(value)) throw invalidRestRead()
		return immutableArray(value.map((item) => decodeFieldValue(field, item)))
	}
	if (operator === 'has') return decodeListElement(field, value)
	if (operator === 'hasSome' || operator === 'hasEvery') {
		if (!isUnknownArray(value)) throw invalidRestRead()
		return immutableArray(value.map((item) => decodeListElement(field, item)))
	}
	if (operator === 'contains' || operator === 'containedBy') {
		return field.kind === 'object'
			? decodeObject(field, value, true)
			: field.kind === 'json' || field.kind.includes('.')
				? value
				: decodeFieldValue(field, value)
	}
	return untouchedOperators.has(operator)
		? value
		: decodeFieldValue(field, value)
}

const resolvePathField = (
	field: GenericField,
	path: readonly unknown[],
): GenericField | undefined => {
	let current: GenericField | undefined = field
	for (const segment of path) {
		if (typeof segment !== 'string' || current?.kind !== 'object') {
			return undefined
		}
		current = objectChildFields(current)[segment]
	}
	return current
}

const decodeAt = (field: GenericField, value: unknown): unknown => {
	if (!isUnknownArray(value)) return value
	return immutableArray(
		value.map((entry) => {
			if (!isPlainRecord(entry) || !isUnknownArray(entry.path)) return entry
			const target = resolvePathField(field, entry.path)
			if (target === undefined) return entry
			return immutableRecord(
				Object.fromEntries(
					Object.entries(entry).map(([key, item]) => [
						key,
						key === 'path' ? item : decodeOperator(target, key, item),
					]),
				),
			)
		}),
	)
}

const decodeRelationshipWhere = (
	field: GenericField,
	value: unknown,
): unknown => {
	const target = getFieldSchemaTarget(field)?.()
	return target === undefined ? value : decodeRestWhere(target, value)
}

const decodeFieldOperators = (field: GenericField, value: unknown): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([operator, operand]) => {
				if (operator === 'at') return [operator, decodeAt(field, operand)]
				if (
					operator === 'some' ||
					operator === 'none' ||
					operator === 'every' ||
					operator === 'is' ||
					operator === 'isNot'
				) {
					return [operator, decodeRelationshipWhere(field, operand)]
				}
				if (operator === 'count' && isPlainRecord(operand)) {
					const target = getFieldSchemaTarget(field)?.()
					return [
						operator,
						immutableRecord({
							...operand,
							...(Object.hasOwn(operand, 'where') && target !== undefined
								? { where: decodeRestWhere(target, operand.where) }
								: {}),
						}),
					]
				}
				return [operator, decodeOperator(field, operator, operand)]
			}),
		),
	)
}

/** Decodes field values while leaving operator validity to Core normalization. */
export const decodeRestWhere = (
	schema: SchemaDefinition,
	value: unknown,
): unknown => {
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value).map(([name, item]) => {
				if (name === 'AND' || name === 'OR') {
					return [
						name,
						isUnknownArray(item)
							? immutableArray(
									item.map((entry) => decodeRestWhere(schema, entry)),
								)
							: item,
					]
				}
				if (name === 'NOT') return [name, decodeRestWhere(schema, item)]
				const field = schema.fields[name]
				return [
					name,
					field === undefined ? item : decodeFieldOperators(field, item),
				]
			}),
		),
	)
}

import { Buffer } from 'node:buffer'

import {
	GraphQLError,
	GraphQLScalarType,
	Kind,
	valueFromASTUntyped,
} from 'graphql'

const scalarFailure = (name: string): GraphQLError =>
	new GraphQLError(`${name} cannot represent the supplied value`)

const parseString = (
	name: string,
	value: unknown,
	accept: (value: string) => boolean,
): string => {
	if (typeof value !== 'string' || !accept(value)) throw scalarFailure(name)
	return value
}

const canonicalIntegerPattern = /^(?:0|-[1-9]\d*|[1-9]\d*)$/u
const decimalPattern = /^(?:0|-[1-9]\d*|[1-9]\d*)(?:\.\d+)?$/u
const datePattern = /^\d{4}-\d{2}-\d{2}$/u
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}$/u
const zonedTimePattern =
	/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u
const utcDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const paddedBase64Pattern =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

const isCalendarDate = (value: string): boolean => {
	const time = Date.parse(`${value}T00:00:00.000Z`)
	return (
		datePattern.test(value) &&
		Number.isFinite(time) &&
		new Date(time).toISOString().slice(0, 10) === value
	)
}

const isUtcDateTime = (value: string): boolean => {
	const time = Date.parse(value)
	return (
		utcDateTimePattern.test(value) &&
		Number.isFinite(time) &&
		new Date(time).toISOString() === value
	)
}

const stringScalar = (
	name: string,
	description: string,
	accept: (value: string) => boolean,
): GraphQLScalarType<string, string> =>
	new GraphQLScalarType({
		name,
		description,
		parseLiteral: (node) =>
			parseString(
				name,
				node.kind === Kind.STRING ? node.value : undefined,
				accept,
			),
		parseValue: (value) => parseString(name, value, accept),
		serialize: (value) => parseString(name, value, accept),
	})

const readSafeInt = (value: unknown): number => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw scalarFailure('SafeInt')
	}
	return value
}

/** JavaScript-safe integral GraphQL number. */
export const GraphqlSafeInt: GraphQLScalarType<number, number> =
	new GraphQLScalarType<number, number>({
		name: 'SafeInt',
		description: 'A JavaScript safe integer.',
		parseLiteral: (node) => {
			if (node.kind !== Kind.INT) throw scalarFailure('SafeInt')
			return readSafeInt(Number(node.value))
		},
		parseValue: readSafeInt,
		serialize: readSafeInt,
	})

const parseBigInt = (value: unknown): bigint =>
	BigInt(
		parseString('BigInt', value, (candidate) =>
			canonicalIntegerPattern.test(candidate),
		),
	)

export const GraphqlBigInt: GraphQLScalarType<bigint, string> =
	new GraphQLScalarType<bigint, string>({
		name: 'BigInt',
		description: 'A canonical base-10 integer string.',
		parseLiteral: (node) =>
			parseBigInt(node.kind === Kind.STRING ? node.value : undefined),
		parseValue: parseBigInt,
		serialize: (value) => {
			if (typeof value !== 'bigint') throw scalarFailure('BigInt')
			return value.toString(10)
		},
	})
export const GraphqlDecimal: GraphQLScalarType<string, string> = stringScalar(
	'Decimal',
	'A canonical exact decimal string.',
	(value) => decimalPattern.test(value),
)
export const GraphqlDate: GraphQLScalarType<string, string> = stringScalar(
	'Date',
	'A canonical calendar date.',
	isCalendarDate,
)
export const GraphqlTime: GraphQLScalarType<string, string> = stringScalar(
	'Time',
	'A millisecond-precision time, optionally carrying a timezone.',
	(value) => localTimePattern.test(value) || zonedTimePattern.test(value),
)
export const GraphqlDateTime: GraphQLScalarType<string, string> = stringScalar(
	'DateTime',
	'A canonical UTC timestamp.',
	isUtcDateTime,
)
export const GraphqlUUID: GraphQLScalarType<string, string> = stringScalar(
	'UUID',
	'A canonical UUID string.',
	(value) => uuidPattern.test(value),
)

const parseBase64 = (value: unknown): Uint8Array => {
	const encoded = parseString(
		'Base64',
		value,
		(candidate) =>
			candidate.length % 4 === 0 && paddedBase64Pattern.test(candidate),
	)
	return Uint8Array.from(Buffer.from(encoded, 'base64'))
}

export const GraphqlBase64: GraphQLScalarType<Uint8Array, string> =
	new GraphQLScalarType<Uint8Array, string>({
		name: 'Base64',
		description: 'A canonical padded base64 string.',
		parseLiteral: (node) =>
			parseBase64(node.kind === Kind.STRING ? node.value : undefined),
		parseValue: parseBase64,
		serialize: (value) => {
			if (!(value instanceof Uint8Array)) throw scalarFailure('Base64')
			return Buffer.from(value).toString('base64')
		},
	})

const snapshotJson = (value: unknown): unknown => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return value
	}
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (Array.isArray(value)) return Object.freeze(value.map(snapshotJson))
	if (typeof value === 'object') {
		const prototype: unknown = Object.getPrototypeOf(value)
		if (prototype !== Object.prototype && prototype !== null) {
			throw scalarFailure('JSON')
		}
		const entries = Object.entries(value).map(([key, entry]) => [
			key,
			snapshotJson(entry),
		])
		return Object.freeze(Object.fromEntries(entries))
	}
	throw scalarFailure('JSON')
}

export const GraphqlJSON: GraphQLScalarType<unknown, unknown> =
	new GraphQLScalarType<unknown, unknown>({
		name: 'JSON',
		description: 'A JSON-compatible value.',
		parseLiteral: (node, variables) =>
			snapshotJson(valueFromASTUntyped(node, variables)),
		parseValue: snapshotJson,
		serialize: snapshotJson,
	})

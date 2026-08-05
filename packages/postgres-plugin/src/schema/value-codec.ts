import { Buffer } from 'node:buffer'

import {
	fieldUsesTemporalTimezone,
	getPluginFieldStorageCodec,
	Pointer,
	snapshotScalarFieldValue,
	type FieldValidationPlan,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Translates one logical field value across its PostgreSQL storage boundary. */
export interface PostgresValueCodec {
	readonly decode: (value: unknown) => unknown
	readonly encode: (value: unknown) => unknown
}

const identityCodec: PostgresValueCodec = immutableRecord({
	decode: (value: unknown): unknown => value,
	encode: (value: unknown): unknown => value,
})

/** Reapplies the field's logical snapshot contract to driver scalar values. */
const createLogicalScalarCodec = (
	plan: FieldValidationPlan & { readonly kind: 'scalar' },
): PostgresValueCodec => {
	const snapshot = (value: unknown): unknown =>
		snapshotScalarFieldValue(plan.field, value, 'PostgreSQL scalar value')

	return immutableRecord({ decode: snapshot, encode: snapshot })
}

/** Stores only the target UUID while restoring the exact logical schema identity. */
export const createPostgresPointerValueCodec = (
	plan: FieldValidationPlan & { readonly kind: 'scalar' },
	target: SchemaDefinition,
): PostgresValueCodec => {
	const codec: PostgresValueCodec = immutableRecord({
		decode: (value: unknown): Pointer => {
			if (typeof value !== 'string') {
				throw new TypeError('PostgreSQL pointer value must be a UUID string')
			}

			return new Pointer(target, value)
		},
		encode: (value: unknown): string => {
			const pointer = snapshotScalarFieldValue(
				plan.field,
				value,
				'PostgreSQL pointer value',
			)

			if (!Pointer.is(pointer)) {
				throw new TypeError('PostgreSQL pointer value must be a Pointer')
			}

			return pointer.id
		},
	})

	return immutableRecord({
		decode: (value: unknown): unknown =>
			applyCodec(plan, codec, 'decode', value),
		encode: (value: unknown): unknown =>
			applyCodec(plan, codec, 'encode', value),
	})
}

const copyBinary = (value: unknown, path: string): Uint8Array => {
	if (!(value instanceof Uint8Array)) {
		throw new TypeError(`${path} must be a Uint8Array`)
	}

	// Database values receive independent byte storage before reaching application code.
	return Uint8Array.from(value)
}

const binaryCodec: PostgresValueCodec = immutableRecord({
	decode: (value: unknown): Uint8Array => copyBinary(value, 'binary value'),
	encode: (value: unknown): Uint8Array => copyBinary(value, 'binary value'),
})

const jsonbBigintCodec: PostgresValueCodec = immutableRecord({
	decode: (value: unknown): bigint => {
		if (typeof value !== 'string') {
			throw new TypeError('encoded bigint must be a string')
		}

		return BigInt(value)
	},
	encode: (value: unknown): string => {
		if (typeof value !== 'bigint') {
			throw new TypeError('bigint value must be a bigint')
		}

		return value.toString()
	},
})

const jsonbBinaryCodec: PostgresValueCodec = immutableRecord({
	decode: (value: unknown): Uint8Array => {
		if (typeof value !== 'string') {
			throw new TypeError('encoded binary value must be a base64 string')
		}

		const decoded = Buffer.from(value, 'base64')

		if (decoded.toString('base64') !== value) {
			throw new TypeError('encoded binary value must use canonical base64')
		}

		return Uint8Array.from(decoded)
	},
	encode: (value: unknown): string =>
		Buffer.from(copyBinary(value, 'binary value')).toString('base64'),
})

const postgresTimePattern =
	/^(?<clock>\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?(?<timezone>Z|[+-]\d{2}(?::?\d{2})?)?$/u
const postgresDateTimePattern = /^(?<date>\d{4}-\d{2}-\d{2})[ T](?<time>.+)$/u

const normalizePostgresTimezone = (timezone: string | undefined): string => {
	if (timezone === undefined || timezone === 'Z') {
		return timezone ?? ''
	}

	if (/^[+-]\d{2}$/u.test(timezone)) {
		return timezone === '+00' ? 'Z' : `${timezone}:00`
	}

	if (/^[+-]\d{4}$/u.test(timezone)) {
		return `${timezone.slice(0, 3)}:${timezone.slice(3)}`
	}

	return timezone === '+00:00' ? 'Z' : timezone
}

const normalizePostgresTime = (value: string, timezone: boolean): string => {
	const match = postgresTimePattern.exec(value)
	const groups = match?.groups
	const clock = groups?.clock
	const suffix = normalizePostgresTimezone(groups?.timezone)

	if (
		clock === undefined ||
		(timezone && suffix.length === 0) ||
		(!timezone && suffix.length > 0)
	) {
		throw new TypeError('PostgreSQL returned an invalid time value')
	}

	// PostgreSQL omits trailing fractional zeroes, while Schema requires millisecond precision.
	const fraction = (groups?.fraction ?? '').padEnd(3, '0')

	return `${clock}.${fraction}${suffix}`
}

const normalizePostgresDateTime = (
	value: string,
	timezone: boolean,
): string => {
	const match = postgresDateTimePattern.exec(value)
	const date = match?.groups?.date
	const time = match?.groups?.time

	if (date === undefined || time === undefined) {
		throw new TypeError('PostgreSQL returned an invalid date-time value')
	}

	const canonical = `${date}T${normalizePostgresTime(time, timezone)}`

	if (!timezone) return canonical

	const timestamp = Date.parse(canonical)

	if (!Number.isFinite(timestamp)) {
		throw new TypeError('PostgreSQL returned an invalid date-time value')
	}

	// Zoned PostgreSQL timestamps represent instants, so reads use canonical UTC.
	return new Date(timestamp).toISOString()
}

const readPostgresTemporalText = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('PostgreSQL temporal value must be a string')
	}

	return value
}

/** Normalizes either native PostgreSQL time representation by its returned suffix. */
export const normalizePostgresDriverTime = (value: unknown): string => {
	const text = readPostgresTemporalText(value)
	const timezone =
		postgresTimePattern.exec(text)?.groups?.timezone !== undefined

	return normalizePostgresTime(text, timezone)
}

/** Normalizes a native timestamp-without-time-zone driver string. */
export const normalizePostgresDriverLocalDateTime = (value: unknown): string =>
	normalizePostgresDateTime(readPostgresTemporalText(value), false)

/** Normalizes a native timestamp-with-time-zone driver string to UTC. */
export const normalizePostgresDriverZonedDateTime = (value: unknown): string =>
	normalizePostgresDateTime(readPostgresTemporalText(value), true)

const createTemporalCodec = (
	plan: FieldValidationPlan & { readonly kind: 'scalar' },
): PostgresValueCodec => {
	const timezone = fieldUsesTemporalTimezone(plan.field)
	const decode = (value: unknown): unknown => {
		const text = readPostgresTemporalText(value)

		const normalized =
			plan.field.kind === 'time'
				? normalizePostgresTime(text, timezone)
				: normalizePostgresDateTime(text, timezone)

		return snapshotScalarFieldValue(
			plan.field,
			normalized,
			'PostgreSQL temporal value',
		)
	}

	return immutableRecord({ decode, encode: identityCodec.encode })
}

const applyCodec = (
	plan: FieldValidationPlan,
	codec: PostgresValueCodec,
	operation: 'decode' | 'encode',
	value: unknown,
): unknown => {
	if (value !== null) {
		return codec[operation](value)
	}

	if (!plan.nullable) {
		throw new TypeError('PostgreSQL value cannot be null')
	}

	return null
}

const createArrayCodec = (items: FieldValidationPlan): PostgresValueCodec => {
	const itemCodec = createPostgresValueCodec(items, true)

	const mapItems = (
		value: unknown,
		operation: 'decode' | 'encode',
	): unknown => {
		if (!isUnknownArray(value)) {
			throw new TypeError('JSONB list value must be an array')
		}

		return immutableArray(
			value.map((item) => applyCodec(items, itemCodec, operation, item)),
		)
	}

	return immutableRecord({
		decode: (value: unknown): unknown => mapItems(value, 'decode'),
		encode: (value: unknown): unknown => mapItems(value, 'encode'),
	})
}

const createObjectCodec = (
	fields: Readonly<Record<string, FieldValidationPlan>>,
): PostgresValueCodec => {
	const codecs = immutableRecord(
		Object.fromEntries(
			Object.entries(fields).map(([name, plan]) => [
				name,
				createPostgresValueCodec(plan, true),
			]),
		) as Record<string, PostgresValueCodec>,
	)

	const mapObject = (
		value: unknown,
		operation: 'decode' | 'encode',
	): Readonly<Record<string, unknown>> => {
		if (!isPlainRecord(value)) {
			throw new TypeError('JSONB object value must be a plain object')
		}

		for (const name of Object.keys(value)) {
			if (!Object.hasOwn(codecs, name)) {
				throw new TypeError(`JSONB object contains unknown field: ${name}`)
			}
		}

		const entries: [string, unknown][] = Object.entries(codecs)
			.filter(([name]) => operation === 'decode' || Object.hasOwn(value, name))
			.map(([name, codec]) => {
				const field = fields[name]

				if (field === undefined) {
					throw new TypeError(`JSONB codec is missing field metadata: ${name}`)
				}

				if (!Object.hasOwn(value, name)) {
					if (operation === 'decode' && field.nullable) {
						return [name, null]
					}

					throw new TypeError(`JSONB object is missing required field: ${name}`)
				}

				return [name, applyCodec(field, codec, operation, value[name])]
			})

		return immutableRecord(Object.fromEntries(entries))
	}

	return immutableRecord({
		decode: (value: unknown): unknown => mapObject(value, 'decode'),
		encode: (value: unknown): unknown => mapObject(value, 'encode'),
	})
}

const createScalarCodec = (
	plan: FieldValidationPlan & { readonly kind: 'scalar' },
	jsonb: boolean,
): PostgresValueCodec => {
	const pluginStorageCodec = getPluginFieldStorageCodec(plan.field)

	if (pluginStorageCodec !== undefined) {
		if (!jsonb) {
			throw new TypeError(
				'Plugin JSON storage codecs require a PostgreSQL JSONB column',
			)
		}

		// Core already validates and snapshots both codec directions at declaration time.
		return immutableRecord({
			decode: pluginStorageCodec.decode,
			encode: pluginStorageCodec.encode,
		})
	}

	if (plan.field.kind === 'bigint') {
		return jsonb ? jsonbBigintCodec : identityCodec
	}

	if (plan.field.kind === 'binary') {
		return jsonb ? jsonbBinaryCodec : binaryCodec
	}

	if (
		!jsonb &&
		(plan.field.kind === 'dateTime' || plan.field.kind === 'time')
	) {
		return createTemporalCodec(plan)
	}

	return createLogicalScalarCodec(plan)
}

/** Builds a schema-guided codec without relying on JSON's lossy fallback rules. */
export const createPostgresValueCodec = (
	plan: FieldValidationPlan,
	jsonb: boolean,
): PostgresValueCodec => {
	let codec: PostgresValueCodec

	if (plan.kind === 'array') {
		codec = createArrayCodec(plan.items)
	} else if (plan.kind === 'object') {
		codec = createObjectCodec(plan.fields)
	} else {
		codec = createScalarCodec(plan, jsonb)
	}

	return immutableRecord({
		decode: (value: unknown): unknown =>
			applyCodec(plan, codec, 'decode', value),
		encode: (value: unknown): unknown =>
			applyCodec(plan, codec, 'encode', value),
	})
}

/** Encodes only the supplied branches of one structured containment value. */
export const encodePostgresPartialValue = (
	plan: FieldValidationPlan,
	value: unknown,
): unknown => {
	if (value === null) {
		if (!plan.nullable) {
			throw new TypeError('PostgreSQL structured filter value cannot be null')
		}

		return null
	}

	if (plan.kind === 'array') {
		if (!isUnknownArray(value)) {
			throw new TypeError('PostgreSQL structured filter value must be an array')
		}

		return immutableArray(
			value.map((item) => encodePostgresPartialValue(plan.items, item)),
		)
	}

	if (plan.kind === 'object') {
		if (!isPlainRecord(value)) {
			throw new TypeError(
				'PostgreSQL structured filter value must be an object',
			)
		}

		const entries: [string, unknown][] = Object.entries(value).map(
			([name, item]) => {
				const child = plan.fields[name]

				if (child === undefined) {
					throw new TypeError(
						`PostgreSQL structured filter references unknown field: ${name}`,
					)
				}

				return [name, encodePostgresPartialValue(child, item)]
			},
		)

		return immutableRecord(Object.fromEntries(entries))
	}

	return createPostgresValueCodec(plan, true).encode(value)
}

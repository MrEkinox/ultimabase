import { Buffer } from 'node:buffer'

import {
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

type CodecDirection = keyof PostgresValueCodec
type ScalarPlan = FieldValidationPlan & { readonly kind: 'scalar' }

const createCodec = (
	decode: (value: unknown) => unknown,
	encode: (value: unknown) => unknown,
): PostgresValueCodec => immutableRecord({ decode, encode })

/** Enforces the plan's nullability before the non-null codec sees a value. */
const withNullability = (
	plan: FieldValidationPlan,
	codec: PostgresValueCodec,
): PostgresValueCodec => {
	const apply =
		(direction: CodecDirection) =>
		(value: unknown): unknown => {
			if (value !== null) {
				return codec[direction](value)
			}

			if (!plan.nullable) {
				throw new TypeError('PostgreSQL value cannot be null')
			}

			return null
		}

	return createCodec(apply('decode'), apply('encode'))
}

/** Stores only the target UUID while restoring the exact logical schema identity. */
export const createPostgresPointerValueCodec = (
	plan: ScalarPlan,
	target: SchemaDefinition,
): PostgresValueCodec =>
	withNullability(
		plan,
		createCodec(
			(value: unknown): Pointer => {
				if (typeof value !== 'string') {
					throw new TypeError('PostgreSQL pointer value must be a UUID string')
				}

				return new Pointer(target, value)
			},
			(value: unknown): string => {
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
		),
	)

const jsonbBigintCodec = createCodec(
	(value: unknown): bigint => {
		if (typeof value !== 'string') {
			throw new TypeError('encoded bigint must be a string')
		}

		return BigInt(value)
	},
	(value: unknown): string => {
		if (typeof value !== 'bigint') {
			throw new TypeError('bigint value must be a bigint')
		}

		return value.toString()
	},
)

const jsonbBinaryCodec = createCodec(
	(value: unknown): Uint8Array => {
		if (typeof value !== 'string') {
			throw new TypeError('encoded binary value must be a base64 string')
		}

		const decoded = Buffer.from(value, 'base64')

		if (decoded.toString('base64') !== value) {
			throw new TypeError('encoded binary value must use canonical base64')
		}

		return Uint8Array.from(decoded)
	},
	(value: unknown): string => {
		if (!(value instanceof Uint8Array)) {
			throw new TypeError('binary value must be a Uint8Array')
		}

		return Buffer.from(value).toString('base64')
	},
)

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
	const groups = postgresTimePattern.exec(value)?.groups
	const clock = groups?.clock
	const suffix = normalizePostgresTimezone(groups?.timezone)

	if (clock === undefined || timezone !== suffix.length > 0) {
		throw new TypeError('PostgreSQL returned an invalid time value')
	}

	// PostgreSQL omits trailing fractional zeroes, while Schema requires millisecond precision.
	return `${clock}.${(groups?.fraction ?? '').padEnd(3, '0')}${suffix}`
}

const normalizePostgresDateTime = (
	value: string,
	timezone: boolean,
): string => {
	const groups = postgresDateTimePattern.exec(value)?.groups
	const date = groups?.date
	const time = groups?.time

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

	return normalizePostgresTime(
		text,
		postgresTimePattern.exec(text)?.groups?.timezone !== undefined,
	)
}

/** Normalizes a native timestamp-without-time-zone driver string. */
export const normalizePostgresDriverLocalDateTime = (value: unknown): string =>
	normalizePostgresDateTime(readPostgresTemporalText(value), false)

/** Normalizes a native timestamp-with-time-zone driver string to UTC. */
export const normalizePostgresDriverZonedDateTime = (value: unknown): string =>
	normalizePostgresDateTime(readPostgresTemporalText(value), true)

const createArrayCodec = (items: FieldValidationPlan): PostgresValueCodec => {
	const itemCodec = createPostgresValueCodec(items)
	const mapItems =
		(direction: CodecDirection) =>
		(value: unknown): unknown => {
			if (!isUnknownArray(value)) {
				throw new TypeError('JSONB list value must be an array')
			}

			return immutableArray(value.map((item) => itemCodec[direction](item)))
		}

	return createCodec(mapItems('decode'), mapItems('encode'))
}

const createObjectCodec = (
	fields: Readonly<Record<string, FieldValidationPlan>>,
): PostgresValueCodec => {
	const children = new Map(
		Object.entries(fields).map(([name, plan]) => [
			name,
			{ codec: createPostgresValueCodec(plan), nullable: plan.nullable },
		]),
	)
	const mapObject =
		(direction: CodecDirection) =>
		(value: unknown): unknown => {
			if (!isPlainRecord(value)) {
				throw new TypeError('JSONB object value must be a plain object')
			}

			for (const name of Object.keys(value)) {
				if (!children.has(name)) {
					throw new TypeError(`JSONB object contains unknown field: ${name}`)
				}
			}

			const entries: [string, unknown][] = []

			for (const [name, child] of children) {
				if (Object.hasOwn(value, name)) {
					entries.push([name, child.codec[direction](value[name])])
				} else if (direction === 'decode') {
					// Stored documents may predate an optional field; encoding never invents one.
					if (!child.nullable) {
						throw new TypeError(
							`JSONB object is missing required field: ${name}`,
						)
					}

					entries.push([name, null])
				}
			}

			return immutableRecord(Object.fromEntries(entries))
		}

	return createCodec(mapObject('decode'), mapObject('encode'))
}

const createScalarCodec = (plan: ScalarPlan): PostgresValueCodec => {
	const pluginStorageCodec = getPluginFieldStorageCodec(plan.field)

	if (pluginStorageCodec !== undefined) {
		// Core already validates and snapshots both codec directions at declaration time.
		return createCodec(pluginStorageCodec.decode, pluginStorageCodec.encode)
	}

	if (plan.field.kind === 'bigint') return jsonbBigintCodec
	if (plan.field.kind === 'binary') return jsonbBinaryCodec

	// Reapplies the field's logical snapshot contract in both directions.
	const snapshot = (value: unknown): unknown =>
		snapshotScalarFieldValue(plan.field, value, 'PostgreSQL scalar value')

	return createCodec(snapshot, snapshot)
}

/** Builds a schema-guided JSONB codec without relying on JSON's lossy fallback rules. */
export const createPostgresValueCodec = (
	plan: FieldValidationPlan,
): PostgresValueCodec =>
	withNullability(
		plan,
		plan.kind === 'array'
			? createArrayCodec(plan.items)
			: plan.kind === 'object'
				? createObjectCodec(plan.fields)
				: createScalarCodec(plan),
	)

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

		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).map(([name, item]) => {
					const child = plan.fields[name]

					if (child === undefined) {
						throw new TypeError(
							`PostgreSQL structured filter references unknown field: ${name}`,
						)
					}

					return [name, encodePostgresPartialValue(child, item)]
				}),
			),
		)
	}

	return createPostgresValueCodec(plan).encode(value)
}

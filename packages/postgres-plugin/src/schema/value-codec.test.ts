import { Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	mapPostgresColumnFromDriver,
	mapPostgresColumnToDriver,
} from './column-value.test-support.js'
import { compilePostgresSchema } from './schema-compiler.js'
import { createStoredPluginField } from './storage-codec-fixture.test-support.js'
import {
	normalizePostgresDriverLocalDateTime,
	normalizePostgresDriverTime,
	normalizePostgresDriverZonedDateTime,
} from './value-codec.js'

describe('PostgreSQL Drizzle column value mapping', () => {
	it('round-trips schema-guided JSONB values without losing native scalars', () => {
		const schema = Schema.define({
			className: 'CodecFixture',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({
						avatar: field.binary(),
						loginAt: field.dateTime(),
						nestedCounts: field.bigint({ list: [true, true] }),
						nickname: field.string(),
					}),
				}),
			}),
		})
		const column = compilePostgresSchema(schema).fields.profile?.column

		if (column === undefined) {
			throw new TypeError('Expected the profile column')
		}

		const avatar = Uint8Array.from([0, 127, 255])
		const logical = {
			avatar,
			loginAt: '2026-08-01T12:30:45.123+02:00',
			nestedCounts: [[1n, 9_007_199_254_740_993n]],
		}
		const encoded = mapPostgresColumnToDriver(column, logical)
		const decoded = mapPostgresColumnFromDriver(column, encoded)

		expect(encoded).toStrictEqual({
			avatar: 'AH//',
			loginAt: logical.loginAt,
			nestedCounts: [['1', '9007199254740993']],
		})
		expect(decoded).toStrictEqual({ ...logical, nickname: null })
		expect(decoded).not.toBe(logical)
		if (
			typeof decoded !== 'object' ||
			decoded === null ||
			!('avatar' in decoded) ||
			!(decoded.avatar instanceof Uint8Array)
		) {
			throw new TypeError('Expected decoded native bytes')
		}

		expect(decoded.avatar).not.toBe(avatar)
		expect(Object.isFrozen(encoded)).toBe(true)
		expect(Object.isFrozen(decoded)).toBe(true)
	})

	it('delegates top-level binary values to Drizzle bytea mapping', () => {
		const schema = Schema.define({
			className: 'BinaryCodecFixture',
			fields: (field) => ({ payload: field.binary() }),
		})
		const column = compilePostgresSchema(schema).fields.payload?.column

		if (column === undefined) {
			throw new TypeError('Expected the payload column')
		}

		const source = Uint8Array.from([1, 2, 3])
		const encoded = mapPostgresColumnToDriver(column, source)
		const decoded = mapPostgresColumnFromDriver(column, source)

		expect(encoded).toBe(source)
		expect(decoded).toStrictEqual(source)
		expect(decoded).toBe(source)
	})

	it('snapshots top-level JSON values before exposing driver data', () => {
		const schema = Schema.define({
			className: 'JsonCodecFixture',
			fields: (field) => ({ metadata: field.json() }),
		})
		const column = compilePostgresSchema(schema).fields.metadata?.column

		if (column === undefined) {
			throw new TypeError('Expected the metadata column')
		}

		const source = { nested: { enabled: true }, tags: ['stable'] }
		const decoded = mapPostgresColumnFromDriver(column, source)

		expect(decoded).toStrictEqual(source)
		expect(decoded).not.toBe(source)
		expect(Object.isFrozen(decoded)).toBe(true)
		if (typeof decoded !== 'object' || decoded === null) {
			throw new TypeError('Expected decoded JSON object')
		}

		expect(Object.isFrozen(Reflect.get(decoded, 'nested'))).toBe(true)
		expect(Object.isFrozen(Reflect.get(decoded, 'tags'))).toBe(true)
	})

	it('round-trips portable plugin codecs through top-level JSONB columns', () => {
		const schema = Schema.define({
			className: 'PluginCodecFixture',
			fields: () => ({ protectedValue: createStoredPluginField() }),
		})
		const field = compilePostgresSchema(schema).fields.protectedValue

		if (field === undefined) {
			throw new TypeError('Expected the protected value column')
		}

		expect(field.storage).toBe('jsonb')
		expect(field.column.notNull).toBe(true)
		expect(mapPostgresColumnToDriver(field.column, 'logical')).toStrictEqual({
			value: 'logical',
			version: 1,
		})
		expect(
			mapPostgresColumnFromDriver(field.column, {
				value: 'stored',
				version: 1,
			}),
		).toBe('stored')
		expect(() =>
			mapPostgresColumnFromDriver(field.column, { value: 42, version: 1 }),
		).toThrow('Stored plugin fixture is invalid')
	})

	it('normalizes PostgreSQL temporal text into Schema values', () => {
		expect(normalizePostgresDriverLocalDateTime('2026-08-01 12:30:45.1')).toBe(
			'2026-08-01T12:30:45.100',
		)
		expect(normalizePostgresDriverTime('12:30:45')).toBe('12:30:45.000')
		expect(normalizePostgresDriverZonedDateTime('2026-08-01 12:30:45+02')).toBe(
			'2026-08-01T10:30:45.000Z',
		)
		expect(normalizePostgresDriverTime('12:30:45.12+0230')).toBe(
			'12:30:45.120+02:30',
		)
	})

	it('rejects malformed PostgreSQL temporal text', () => {
		expect(() =>
			normalizePostgresDriverLocalDateTime('2026-08-01 12:30:45+00'),
		).toThrow(new TypeError('PostgreSQL returned an invalid time value'))
		expect(() => normalizePostgresDriverZonedDateTime('not-a-date')).toThrow(
			new TypeError('PostgreSQL returned an invalid date-time value'),
		)
		expect(() => normalizePostgresDriverZonedDateTime(new Date())).toThrow(
			new TypeError('PostgreSQL temporal value must be a string'),
		)
	})

	it('rejects corrupted JSONB structures instead of returning partial values', () => {
		const schema = Schema.define({
			className: 'CorruptCodecFixture',
			fields: (field) => ({
				profile: field.object({
					fields: (field) => ({
						count: field.bigint({ validation: { required: true } }),
					}),
				}),
			}),
		})
		const column = compilePostgresSchema(schema).fields.profile?.column

		if (column === undefined) {
			throw new TypeError('Expected the profile column')
		}

		expect(() => mapPostgresColumnFromDriver(column, [])).toThrow(
			new TypeError('JSONB object value must be a plain object'),
		)
		expect(() => mapPostgresColumnFromDriver(column, { unknown: '1' })).toThrow(
			new TypeError('JSONB object contains unknown field: unknown'),
		)
		expect(() => mapPostgresColumnFromDriver(column, { count: 1 })).toThrow(
			new TypeError('encoded bigint must be a string'),
		)
		expect(() => mapPostgresColumnFromDriver(column, { count: null })).toThrow(
			new TypeError('PostgreSQL value cannot be null'),
		)
		expect(() =>
			mapPostgresColumnFromDriver(column, { count: '1', extra: 'value' }),
		).toThrow(new TypeError('JSONB object contains unknown field: extra'))
	})
})

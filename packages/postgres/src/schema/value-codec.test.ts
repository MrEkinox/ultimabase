import {
	bigintField,
	binaryField,
	dateTimeField,
	Schema,
	objectField,
	stringField,
	timeField,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from './schema-compiler.js'

describe('PostgreSQL value codecs', () => {
	it('round-trips schema-guided JSONB values without losing native scalars', () => {
		const schema = new Schema({
			className: 'CodecFixture',
			fields: {
				profile: objectField({
					fields: {
						avatar: binaryField(),
						loginAt: dateTimeField(),
						nestedCounts: bigintField({ list: [true, true] }),
						nickname: stringField(),
					},
				}),
			},
		})
		const codec = compilePostgresSchema(schema).fields.profile?.codec

		if (codec === undefined) {
			throw new TypeError('Expected the profile codec')
		}

		const avatar = Uint8Array.from([0, 127, 255])
		const logical = {
			avatar,
			loginAt: '2026-08-01T12:30:45.123+02:00',
			nestedCounts: [[1n, 9_007_199_254_740_993n]],
		}
		const encoded = codec.encode(logical)
		const decoded = codec.decode(encoded)

		expect(encoded).toStrictEqual({
			avatar: 'AH//',
			loginAt: logical.loginAt,
			nestedCounts: [['1', '9007199254740993']],
		})
		expect(decoded).toStrictEqual(logical)
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

	it('copies top-level binary values in both directions', () => {
		const schema = new Schema({
			className: 'BinaryCodecFixture',
			fields: { payload: binaryField() },
		})
		const codec = compilePostgresSchema(schema).fields.payload?.codec

		if (codec === undefined) {
			throw new TypeError('Expected the payload codec')
		}

		const source = Uint8Array.from([1, 2, 3])
		const encoded = codec.encode(source)
		const decoded = codec.decode(source)

		expect(encoded).toStrictEqual(source)
		expect(decoded).toStrictEqual(source)
		expect(encoded).not.toBe(source)
		expect(decoded).not.toBe(source)
	})

	it('normalizes PostgreSQL temporal text into Schema values', () => {
		const schema = new Schema({
			className: 'TemporalCodecFixture',
			fields: {
				localDateTime: dateTimeField({ timezone: false }),
				localTime: timeField(),
				zonedDateTime: dateTimeField(),
				zonedTime: timeField({ timezone: true }),
			},
		})
		const fields = compilePostgresSchema(schema).fields

		expect(fields.localDateTime?.codec.decode('2026-08-01 12:30:45.1')).toBe(
			'2026-08-01T12:30:45.100',
		)
		expect(fields.localTime?.codec.decode('12:30:45')).toBe('12:30:45.000')
		expect(fields.zonedDateTime?.codec.decode('2026-08-01 12:30:45+02')).toBe(
			'2026-08-01T10:30:45.000Z',
		)
		expect(fields.zonedTime?.codec.decode('12:30:45.12+0230')).toBe(
			'12:30:45.120+02:30',
		)
	})

	it('rejects malformed PostgreSQL temporal text', () => {
		const schema = new Schema({
			className: 'InvalidTemporalCodecFixture',
			fields: {
				local: dateTimeField({ timezone: false }),
				zoned: dateTimeField(),
			},
		})
		const fields = compilePostgresSchema(schema).fields

		expect(() => fields.local?.codec.decode('2026-08-01 12:30:45+00')).toThrow(
			new TypeError('PostgreSQL returned an invalid time value'),
		)
		expect(() => fields.zoned?.codec.decode('not-a-date')).toThrow(
			new TypeError('PostgreSQL returned an invalid date-time value'),
		)
		expect(() => fields.zoned?.codec.decode(new Date())).toThrow(
			new TypeError('PostgreSQL temporal value must be a string'),
		)
	})

	it('rejects corrupted JSONB structures instead of returning partial values', () => {
		const schema = new Schema({
			className: 'CorruptCodecFixture',
			fields: {
				profile: objectField({ fields: { count: bigintField() } }),
			},
		})
		const codec = compilePostgresSchema(schema).fields.profile?.codec

		if (codec === undefined) {
			throw new TypeError('Expected the profile codec')
		}

		expect(() => codec.decode([])).toThrow(
			new TypeError('JSONB object value must be a plain object'),
		)
		expect(() => codec.decode({ unknown: '1' })).toThrow(
			new TypeError('JSONB object contains unknown field: unknown'),
		)
		expect(() => codec.decode({ count: 1 })).toThrow(
			new TypeError('encoded bigint must be a string'),
		)
		expect(() => codec.decode({ count: null })).toThrow(
			new TypeError('PostgreSQL value cannot be null'),
		)
		expect(() => codec.decode({ count: '1', extra: 'value' })).toThrow(
			new TypeError('JSONB object contains unknown field: extra'),
		)
	})
})

import { binaryField, Pointer, Schema, stringField } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { decodePostgresRecord, encodePostgresRecord } from './record-codec.js'
import { createPostgresPointerFixture } from '../schema/pointer-fixture.test-support.js'

const codecSchema = compilePostgresSchema(
	Schema.define({
		className: 'CodecFixture',
		fields: {
			alias: stringField({ validation: { nullable: true } }),
			note: stringField(),
			payload: binaryField({ validation: { required: true } }),
			title: stringField({ validation: { required: true } }),
		},
	}),
)

describe('PostgreSQL record codec', () => {
	it('stores pointer identities and restores exact target schema instances', () => {
		const { catalog, Post, User } = createPostgresPointerFixture()
		const schema = catalog.get(Post)
		const pointer = new Pointer(User, '018f0f8c-7b5a-7cc9-98db-123456789abc')
		const encoded = encodePostgresRecord(schema, { author: pointer })
		const decoded = decodePostgresRecord(schema, encoded)

		expect(encoded).toStrictEqual({ author: pointer.id })
		expect(decoded.author).not.toBe(pointer)
		expect(decoded.author).toSatisfy((value: unknown) => pointer.equals(value))
		expect(() =>
			encodePostgresRecord(schema, {
				author: new Pointer(Post, '018f0f8c-7b5a-7cc9-98db-123456789abc'),
			}),
		).toThrow(
			new TypeError('PostgreSQL pointer value must point to PointerUser'),
		)
	})

	it('round-trips declared values through independent immutable records', () => {
		const payload = new Uint8Array([1, 2, 3])
		const encoded = encodePostgresRecord(codecSchema, {
			alias: null,
			payload,
			title: 'Encoded',
		})
		const decoded = decodePostgresRecord(codecSchema, encoded)

		expect(decoded).toStrictEqual({
			alias: null,
			payload: new Uint8Array([1, 2, 3]),
			title: 'Encoded',
		})
		expect(decoded.payload).not.toBe(payload)
		expect(Object.isFrozen(encoded)).toBe(true)
		expect(Object.isFrozen(decoded)).toBe(true)
	})

	it('restores optional absence while retaining explicitly nullable values', () => {
		const decoded = decodePostgresRecord(codecSchema, {
			alias: null,
			note: null,
			payload: new Uint8Array(),
			title: 'Stored',
		})

		expect(decoded).toHaveProperty('alias', null)
		expect(decoded).not.toHaveProperty('note')
	})

	it('rejects unknown, undefined, and invalid required values', () => {
		expect(() =>
			encodePostgresRecord(codecSchema, { unknown: 'value' }),
		).toThrow(
			new TypeError('PostgreSQL query references missing field: unknown'),
		)
		expect(() =>
			encodePostgresRecord(codecSchema, { title: undefined }),
		).toThrow(
			new TypeError('PostgreSQL mutation field cannot be undefined: title'),
		)
		expect(() => decodePostgresRecord(codecSchema, { title: null })).toThrow(
			new TypeError('PostgreSQL value cannot be null'),
		)
	})
})

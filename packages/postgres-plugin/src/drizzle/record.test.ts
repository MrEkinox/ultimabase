import { Buffer } from 'node:buffer'

import { Pointer, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createPostgresPointerFixture } from '../schema/pointer-fixture.test-support.js'
import { compilePostgresSchema } from '../schema/schema-compiler.js'
import {
	mapPostgresColumnFromDriver,
	mapPostgresColumnToDriver,
} from '../schema/column-value.test-support.js'
import { preparePostgresRecord, readPostgresRecord } from './record.js'

const recordSchema = compilePostgresSchema(
	Schema.define({
		className: 'RecordFixture',
		fields: (field) => ({
			alias: field.string(),
			note: field.string(),
			payload: field.binary({ validation: { required: true } }),
			status: field.enum({ values: ['draft', 'published'] }),
			title: field.string({ validation: { required: true } }),
			views: field.int(),
		}),
	}),
)

describe('PostgreSQL logical records', () => {
	it('keeps pointer values logical for Drizzle column mapping', () => {
		const { catalog, Post, User } = createPostgresPointerFixture()
		const schema = catalog.get(Post)
		const pointer = new Pointer(User, '018f0f8c-7b5a-7cc9-98db-123456789abc')
		const prepared = preparePostgresRecord(schema, { author: pointer })
		const column = schema.fields.author?.column

		if (column === undefined) {
			throw new TypeError('Expected the author column')
		}

		expect(prepared).toStrictEqual({ author: pointer })
		expect(mapPostgresColumnToDriver(column, pointer)).toBe(pointer.id)
		expect(mapPostgresColumnFromDriver(column, pointer.id)).toSatisfy(
			(value: unknown) => pointer.equals(value),
		)
		expect(() =>
			mapPostgresColumnToDriver(
				column,
				new Pointer(Post, '018f0f8c-7b5a-7cc9-98db-123456789abc'),
			),
		).toThrow(
			new TypeError('PostgreSQL pointer value must point to PointerUser'),
		)
	})

	it('detaches record containers without duplicating column transformations', () => {
		const payload = Buffer.from([1, 2, 3])
		const source = {
			alias: null,
			payload,
			title: 'Logical',
		}
		const prepared = preparePostgresRecord(recordSchema, source)
		const read = readPostgresRecord(recordSchema, source)

		expect(prepared).toStrictEqual(source)
		expect(read).toStrictEqual({
			alias: null,
			payload: Uint8Array.from([1, 2, 3]),
			title: 'Logical',
		})
		expect(prepared).not.toBe(source)
		expect(read).not.toBe(source)
		expect(prepared.payload).toBe(payload)
		expect(read.payload).not.toBe(payload)
		expect(read.payload).not.toBeInstanceOf(Buffer)
		expect(Object.isFrozen(prepared)).toBe(true)
		expect(Object.isFrozen(read)).toBe(true)
	})

	it('preserves SQL null as the canonical optional field value', () => {
		const read = readPostgresRecord(recordSchema, {
			alias: null,
			note: null,
			payload: new Uint8Array(),
			title: 'Stored',
		})

		expect(read).toHaveProperty('alias', null)
		expect(read).toHaveProperty('note', null)
	})

	it('rejects native Drizzle values outside the logical field contract', () => {
		expect(() =>
			readPostgresRecord(recordSchema, { status: 'archived' }),
		).toThrow(
			'Invalid enum default at PostgreSQL field value: status: archived',
		)
		expect(() =>
			readPostgresRecord(recordSchema, { views: 9_007_199_254_740_992 }),
		).toThrow('PostgreSQL field value: views must be a safe integer')
		expect(() => readPostgresRecord(recordSchema, { title: null })).toThrow(
			'PostgreSQL required field cannot be null: title',
		)
	})

	it('rejects unknown and undefined mutation fields', () => {
		expect(() =>
			preparePostgresRecord(recordSchema, { unknown: 'value' }),
		).toThrow(
			new TypeError('PostgreSQL query references missing field: unknown'),
		)
		expect(() =>
			preparePostgresRecord(recordSchema, { title: undefined }),
		).toThrow(
			new TypeError('PostgreSQL mutation field cannot be undefined: title'),
		)
	})
})

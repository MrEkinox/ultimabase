import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { queryFromFindManyInput } from '../query/input.js'
import { decodeQueryCursor, encodeQueryCursor } from './cursor.js'

// ADR-0309 decision 6: one opaque, unsigned cursor shared by transports.
const Item = UltimaBase.Schema.define({
	className: 'CursorItem',
	fields: (field) => ({
		blob: field.binary(),
		count: field.bigint(),
		rank: field.int(),
		title: field.string({ required: true }),
	}),
})

const Other = UltimaBase.Schema.define({
	className: 'CursorOther',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

new SchemaRegistry([Item, Other]).resolveSchemaTargets()

const id = '0198f090-2a50-7000-8000-000000000001'
const row = Object.freeze({
	blob: new Uint8Array([0, 255, 7]),
	count: 12345678901234567890n,
	id,
	rank: null,
	title: 'é',
})

const cursorError = (
	run: () => unknown,
): Readonly<{
	code: unknown
	publicDetails: unknown
	publicMessage: unknown
}> => {
	try {
		run()
	} catch (error: unknown) {
		if (!(error instanceof FrameworkError)) throw error
		const code: unknown = error.code
		const publicDetails: unknown = error.publicDetails
		const publicMessage: unknown = error.publicMessage
		return { code, publicDetails, publicMessage }
	}
	throw new Error('expected a cursor error')
}

const invalid = {
	code: 'VALIDATION_ERROR',
	publicDetails: { parameter: 'after' },
	publicMessage: 'The after position is invalid.',
}

describe('query cursors', () => {
	it('round-trips the ordered values of a row, bigint and binary included', () => {
		const orderBy = { count: 'desc', blob: 'asc', rank: 'asc' } as const
		const cursor = encodeQueryCursor(Item, orderBy, row)

		expect(cursor).toMatch(/^[\w-]+$/u)
		expect(cursor.length).toBeLessThanOrEqual(4096)
		expect(decodeQueryCursor(Item, orderBy, cursor)).toStrictEqual({
			blob: new Uint8Array([0, 255, 7]),
			count: 12345678901234567890n,
			id,
			rank: null,
		})
		// The decoded position is a valid `after` for the same read.
		expect(() =>
			queryFromFindManyInput(Item, {
				after: decodeQueryCursor(Item, orderBy, cursor),
				orderBy,
			}),
		).not.toThrow()
	})

	it('encodes the schema name and the ordering completed by id', () => {
		const cursor = encodeQueryCursor(Item, { title: 'asc' }, row)

		expect(
			JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
		).toStrictEqual({
			o: [
				['title', 'a'],
				['id', 'a'],
			],
			p: ['é', id],
			s: 'CursorItem',
			v: 1,
		})
		// Omitting `orderBy` and naming `id` alone give the same cursor.
		expect(encodeQueryCursor(Item, undefined, row)).toBe(
			encodeQueryCursor(Item, { id: 'asc' }, row),
		)
	})

	it('rejects malformed cursors with the after VALIDATION_ERROR', () => {
		const tampered = Buffer.from(
			JSON.stringify({ o: [['id', 'a']], p: [7], s: 'CursorItem', v: 1 }),
		).toString('base64url')

		for (const cursor of [
			'',
			'not base64url!',
			Buffer.from('not json').toString('base64url'),
			Buffer.from('[]').toString('base64url'),
			tampered,
			'a'.repeat(4097),
			42,
		]) {
			expect(
				cursorError(() => decodeQueryCursor(Item, undefined, cursor)),
			).toMatchObject(invalid)
		}
	})

	it('rejects a cursor of another schema or ordering', () => {
		const cursor = encodeQueryCursor(Item, { title: 'asc' }, row)

		for (const run of [
			() => decodeQueryCursor(Other, { title: 'asc' }, cursor),
			() => decodeQueryCursor(Item, { title: 'desc' }, cursor),
			() => decodeQueryCursor(Item, undefined, cursor),
			() => decodeQueryCursor(Item, { rank: 'asc', title: 'asc' }, cursor),
		]) {
			expect(cursorError(run)).toMatchObject(invalid)
		}
	})

	it('names the ordered fields missing from the encoded row', () => {
		expect(
			cursorError(() =>
				encodeQueryCursor(Item, { rank: 'asc' }, { id, title: 'a' }),
			),
		).toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
			publicMessage: 'The after position is missing the ordered fields rank.',
		})
	})

	it('refuses to encode a position longer than 4096 characters', () => {
		expect(
			cursorError(() =>
				encodeQueryCursor(
					Item,
					{ title: 'asc' },
					{ id, title: 'x'.repeat(4000) },
				),
			),
		).toMatchObject({
			code: 'VALIDATION_ERROR',
			publicMessage: 'The after position is too long to encode.',
		})
	})
})

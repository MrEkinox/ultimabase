import { createHmac, timingSafeEqual } from 'node:crypto'

import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import type { QueryCursorCodec, QueryCursorPayload } from './contracts.js'
import { queryCursorVersion } from './contracts.js'
import { QueryCursorError } from './error.js'
import {
	createQueryCursorPayload,
	sealQueryCursor,
	unsealQueryCursor,
} from './payload.js'
import { normalizeQueryOrdering } from '../clauses/ordering.js'

const postSchema = new Schema({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

/** Provides a native integrity check without becoming a production codec. */
class FixtureCursorCodec implements QueryCursorCodec {
	readonly #payloads = new Map<string, unknown>()
	#sequence = 0

	seal(payload: QueryCursorPayload): string {
		return this.issue(payload)
	}

	unseal(cursor: string): unknown {
		const segments = cursor.split('.')
		const identifier = segments[0]
		const signature = segments[1]

		if (
			segments.length !== 2 ||
			identifier === undefined ||
			signature === undefined
		) {
			throw new TypeError('Malformed fixture cursor')
		}

		const expectedSignature = Buffer.from(this.#sign(identifier))
		const actualSignature = Buffer.from(signature)

		if (
			actualSignature.length !== expectedSignature.length ||
			!timingSafeEqual(actualSignature, expectedSignature)
		) {
			throw new TypeError('Invalid fixture cursor signature')
		}

		if (!this.#payloads.has(identifier)) {
			throw new TypeError('Unknown fixture cursor')
		}

		return this.#payloads.get(identifier)
	}

	issue(payload: unknown): string {
		const identifier = String(this.#sequence)

		this.#sequence += 1
		this.#payloads.set(identifier, payload)

		return `${identifier}.${this.#sign(identifier)}`
	}

	#sign(identifier: string): string {
		return createHmac('sha256', 'fixture-secret')
			.update(identifier)
			.digest('base64url')
	}
}

const ordering = normalizeQueryOrdering(postSchema, [
	{ field: 'title', direction: 'descending' },
])

describe('query cursor payloads', () => {
	it('creates, seals, and unseals one stable opaque cursor', async () => {
		const codec = new FixtureCursorCodec()
		const values = { title: 'UltimaBase', id: '019b89dd-example' }
		const payload = createQueryCursorPayload(postSchema, ordering, values)
		const cursor = await sealQueryCursor(codec, payload)
		const decoded = await unsealQueryCursor(codec, cursor, postSchema, ordering)

		expect(payload).toStrictEqual({
			version: 1,
			className: 'Post',
			ordering: [
				{ field: 'title', direction: 'descending', value: 'UltimaBase' },
				{ field: 'id', direction: 'descending', value: '019b89dd-example' },
			],
		})
		expect(decoded).toStrictEqual(payload)
		expect(values).toStrictEqual({
			title: 'UltimaBase',
			id: '019b89dd-example',
		})
		expect(Object.isFrozen(payload)).toBe(true)
		expect(Object.isFrozen(payload.ordering)).toBe(true)
		expect(Object.isFrozen(payload.ordering[0])).toBe(true)
		expect(Object.isFrozen(decoded)).toBe(true)
	})

	it('turns modified and unknown tokens into typed invalid-cursor errors', async () => {
		const codec = new FixtureCursorCodec()
		const payload = createQueryCursorPayload(postSchema, ordering, {
			title: 'UltimaBase',
			id: '019b89dd-example',
		})
		const cursor = await sealQueryCursor(codec, payload)
		let tamperError: unknown

		try {
			await unsealQueryCursor(codec, `${cursor}x`, postSchema, ordering)
		} catch (error: unknown) {
			tamperError = error
		}

		expect(tamperError).toBeInstanceOf(QueryCursorError)
		if (tamperError instanceof QueryCursorError) {
			expect(tamperError.code).toBe('CURSOR_INVALID')
			expect(tamperError.message).toBe('cursor is invalid or has been modified')
			expect(tamperError.cause).toBeInstanceOf(TypeError)
		}
		await expect(
			unsealQueryCursor(codec, '', postSchema, ordering),
		).rejects.toStrictEqual(
			new QueryCursorError(
				'CURSOR_INVALID',
				'cursor must be a non-empty string',
			),
		)
		await expect(
			unsealQueryCursor(
				codec,
				`unknown.${createHmac('sha256', 'fixture-secret')
					.update('unknown')
					.digest('base64url')}`,
				postSchema,
				ordering,
			),
		).rejects.toMatchObject({ code: 'CURSOR_INVALID' })
	})

	it('rejects malformed authenticated payloads as invalid cursors', async () => {
		const codec = new FixtureCursorCodec()
		const malformedPayloads: readonly unknown[] = [
			null,
			{},
			{ version: 1, className: '', ordering: [] },
			{ version: 1, className: 'Post', ordering: 'id' },
			{ version: 1, className: 'Post', ordering: [] },
			{ version: 1, className: 'Post', ordering: [null] },
			{
				version: 1,
				className: 'Post',
				ordering: [{ field: '', direction: 'ascending', value: 'id' }],
			},
			{
				version: 1,
				className: 'Post',
				ordering: [{ field: 'id', direction: 'sideways', value: 'id' }],
			},
			{
				version: 1,
				className: 'Post',
				ordering: [{ field: 'id', direction: 'ascending' }],
			},
			{
				version: 1,
				className: 'Post',
				ordering: [
					{ field: 'title', direction: 'ascending', value: 'UltimaBase' },
				],
			},
		]

		for (const malformedPayload of malformedPayloads) {
			await expect(
				unsealQueryCursor(
					codec,
					codec.issue(malformedPayload),
					postSchema,
					ordering,
				),
			).rejects.toMatchObject({ code: 'CURSOR_INVALID' })
		}
	})

	it('distinguishes incompatible versions, schemas, and ordering', async () => {
		const codec = new FixtureCursorCodec()
		const payload = createQueryCursorPayload(postSchema, ordering, {
			title: 'UltimaBase',
			id: '019b89dd-example',
		})
		const incompatiblePayloads: readonly unknown[] = [
			{ ...payload, version: queryCursorVersion + 1 },
			{ ...payload, className: 'Comment' },
			{ ...payload, ordering: payload.ordering.slice(1) },
			{
				...payload,
				ordering: payload.ordering.map((order) => ({
					...order,
					direction: 'ascending',
				})),
			},
		]

		for (const incompatiblePayload of incompatiblePayloads) {
			await expect(
				unsealQueryCursor(
					codec,
					codec.issue(incompatiblePayload),
					postSchema,
					ordering,
				),
			).rejects.toMatchObject({ code: 'CURSOR_INCOMPATIBLE' })
		}
	})

	it('rejects missing position values and invalid codec output', async () => {
		expect(() =>
			createQueryCursorPayload(postSchema, ordering, { title: 'UltimaBase' }),
		).toThrow(new TypeError('cursor values must include ordered field id'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			createQueryCursorPayload(postSchema, ordering, null)
		}).toThrow(new TypeError('cursor values must be an object'))
		await expect(
			sealQueryCursor(
				{ seal: () => '', unseal: () => undefined },
				createQueryCursorPayload(postSchema, ordering, {
					title: 'UltimaBase',
					id: '019b89dd-example',
				}),
			),
		).rejects.toThrow(
			new TypeError('cursor codec seal must return a non-empty string'),
		)
	})
})

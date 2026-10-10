import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { QueryBuilder } from '../query/query.js'
import { WhereBuilder, normalizeWhereInput } from './where.js'

const Author = UltimaBase.Schema.define({
	className: 'ShorthandAuthor',
	fields: (field) => ({ name: field.string() }),
})

const Other = UltimaBase.Schema.define({
	className: 'ShorthandOther',
	fields: (field) => ({ name: field.string() }),
})

const Entry = UltimaBase.Schema.define({
	className: 'ShorthandEntry',
	fields: (field) => ({
		amount: field.decimal(),
		author: field.pointer({ target: () => Author }),
		blob: field.binary(),
		counter: field.bigint(),
		day: field.date(),
		externalId: field.uuid(),
		labels: field.string({ list: true }),
		metadata: field.json(),
		moment: field.dateTime(),
		profile: field.object({
			fields: (field) => ({ email: field.string() }),
		}),
		published: field.boolean(),
		rating: field.float(),
		status: field.enum({ values: ['draft', 'published'] }),
		tags: field.relation({ target: () => Other }),
		time: field.time(),
		title: field.string(),
		views: field.int(),
	}),
})

new SchemaRegistry([Author, Other, Entry]).resolveSchemaTargets()

const authorId = '0198f090-2a50-7000-8000-000000000001'

describe('where equality shorthand (ADR-0307)', () => {
	it('means eq for every non-list scalar, enum and pointer field', () => {
		const values = {
			amount: '1.25',
			author: authorId,
			blob: new Uint8Array([1, 2]),
			counter: 9n,
			day: '2026-10-10',
			externalId: '550e8400-e29b-41d4-a716-446655440000',
			id: authorId,
			moment: '2026-10-10T08:00:00.000Z',
			published: false,
			rating: 1.5,
			status: 'draft',
			time: '08:00:00.000',
			title: 'Hello',
			views: 3,
		} as const

		for (const [field, value] of Object.entries(values)) {
			expect(normalizeWhereInput(Entry, { [field]: value })).toStrictEqual(
				normalizeWhereInput(Entry, { [field]: { eq: value } }),
			)
		}
	})

	it('means isNull for null', () => {
		expect(normalizeWhereInput(Entry, { title: null })).toStrictEqual(
			normalizeWhereInput(Entry, { title: { isNull: true } }),
		)
		expect(normalizeWhereInput(Entry, { author: null })).toStrictEqual(
			normalizeWhereInput(Entry, { author: { isNull: true } }),
		)
	})

	it('accepts a Pointer of the declared target and rejects another schema', () => {
		expect(
			normalizeWhereInput(Entry, { author: Author.pointer(authorId) }),
		).toStrictEqual(normalizeWhereInput(Entry, { author: { eq: authorId } }))

		let failure: unknown
		try {
			// @ts-expect-error -- A Pointer of another schema is a type error.
			normalizeWhereInput(Entry, { author: Other.pointer(authorId) })
		} catch (error: unknown) {
			failure = error
		}
		expect(failure).toBeInstanceOf(FrameworkError)
		expect(failure).toMatchObject({
			code: 'VALIDATION_ERROR',
			message: 'where.author must be a ShorthandAuthor Pointer or object id',
		})
	})

	it('keeps explicit operators on json, object, list and relation fields', () => {
		for (const [field, value] of [
			['metadata', 'text'],
			['profile', 'text'],
			['labels', 'typed'],
			['tags', authorId],
		] as const) {
			expect(() => normalizeWhereInput(Entry, { [field]: value })).toThrow(
				`where.${field} must be an object`,
			)
		}
	})

	it('keeps the canonical serialized form', () => {
		const shorthand = new WhereBuilder(Entry).and({
			author: Author.pointer(authorId),
			published: false,
			title: null,
		})

		expect(shorthand.build()).toStrictEqual({
			AND: [
				{ author: { eq: authorId } },
				{ published: { eq: false } },
				{ title: { isNull: true } },
			],
		})
		expect(
			new QueryBuilder(Entry).where({ views: 3, title: 'Hello' }).ast.where,
		).toStrictEqual(
			new QueryBuilder(Entry).where({
				views: { eq: 3 },
				title: { eq: 'Hello' },
			}).ast.where,
		)
	})

	it('reaches relation and pointer traversal filters', () => {
		expect(
			normalizeWhereInput(Entry, {
				author: { is: { name: 'Ada' } },
				tags: { some: { name: 'news' } },
			}),
		).toStrictEqual(
			normalizeWhereInput(Entry, {
				author: { is: { name: { eq: 'Ada' } } },
				tags: { some: { name: { eq: 'news' } } },
			}),
		)
	})
})

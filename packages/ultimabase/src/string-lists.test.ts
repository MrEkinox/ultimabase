// String lists (D-120): never optional nor unique, indexed alone and never
// sorted, filtered with `has` and `hasSome`, `[]` when left out.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'
import { resolve } from './schema.ts'

const M = { as: master }

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string(),
		tags: f.string({ list: true }),
	}),
	indexes: [{ fields: ['tags'] }],
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			if (data.title === 'hooked') Object.assign(data, { tags: [''] })
		},
	},
})

const indexed = (index: { fields: string[]; unique?: boolean }) =>
	defineModel({
		name: 'Indexed',
		fields: (f) => ({ title: f.string(), tags: f.string({ list: true }) }),
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types may refuse.
		indexes: [index as { fields: ['tags'] }],
	})

const started = () => defineApp({ database: memory(), models: [Article] })

const invalid = (message: string) => ({ code: 'INVALID_QUERY', message })

describe('a list definition', () => {
	it('is never optional nor unique', () => {
		expect(() =>
			defineModel({
				name: 'Optional',
				// @ts-expect-error: a list is [] when empty.
				fields: (f) => ({ tags: f.string({ list: true, optional: true }) }),
			}),
		).toThrow(
			'A string list is never null: left out, it is []. Remove optional.',
		)
		expect(() =>
			defineModel({
				name: 'Unique',
				// @ts-expect-error: a list cannot be unique.
				fields: (f) => ({ tags: f.string({ list: true, unique: true }) }),
			}),
		).toThrow('A string list cannot be unique.')
	})

	it('is indexed alone, and never by a unique index', () => {
		expect(() => resolve([indexed({ fields: ['title', 'tags'] })])).toThrow(
			"Indexed: the list 'tags' is indexed alone, in an index of its own.",
		)
		expect(() =>
			resolve([indexed({ fields: ['tags'], unique: true })]),
		).toThrow("Indexed: the list 'tags' cannot be unique.")
	})
})

describe('a list', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('is [] when left out, and refuses null or a bad element', async () => {
		expect(await Article.create({ data: { title: 'a' } }, M)).toMatchObject({
			tags: [],
		})
		await expect(
			// @ts-expect-error: a list is never null.
			Article.create({ data: { title: 'b', tags: null } }, M),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['tags'], message: 'Required.' }] },
		})
		await expect(
			// @ts-expect-error: an element is a string.
			Article.create({ data: { title: 'c', tags: [1] } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('refuses a bad list a hook writes', async () => {
		await expect(
			Article.create({ data: { title: 'hooked' } }, M),
		).rejects.toThrow(
			'Article.tags: Expected a list of non-empty strings without a NUL or a lone surrogate. A before hook or validate wrote it.',
		)
	})

	it('is not sorted', async () => {
		await expect(
			// @ts-expect-error: a list is not sorted.
			Article.findMany({ orderBy: { tags: 'asc' } }, M),
		).rejects.toMatchObject(
			invalid('orderBy.tags is a list, which cannot be sorted.'),
		)
	})

	it('takes has and hasSome only, with clean strings', async () => {
		const refusals: [unknown, string][] = [
			[{ has: 5 }, 'where.tags.has must be a non-empty clean string.'],
			[{ has: '' }, 'where.tags.has must be a non-empty clean string.'],
			[{ hasSome: 'ts' }, 'where.tags.hasSome must be a list.'],
			[{ hasSome: ['ts', ''] }, 'where.tags.hasSome.1 must be'],
		]
		for (const [tags, message] of refusals) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
			const where = { tags } as { tags: { has: string } }
			await expect(Article.findMany({ where }, M)).rejects.toMatchObject({
				code: 'INVALID_QUERY',
				message: expect.stringContaining(message) as unknown,
			})
		}
		await Article.create({ data: { title: 'a', tags: ['ts'] } }, M)
		expect(await Article.count({ where: { tags: {} } }, M)).toBe(1)
		await expect(
			// @ts-expect-error: a list has no equals.
			Article.count({ where: { tags: { equals: ['ts'] } } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})

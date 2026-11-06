// Lists of strings, numbers and enum values (D-120, D-127): never optional
// nor unique, indexed alone and never sorted, filtered with `has`,
// `hasSome`, `hasEvery` and `isEmpty` (D-149), `[]` when left out.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { FieldBuilders, RecordOf, WhereOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { resolve } from './schema.ts'
import { listIssue } from './sizes.ts'

const M = { as: master }

type Builders = FieldBuilders<unknown>

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		title: f.string(),
		tags: f.string({ list: true }),
		scores: f.number({ list: true }),
		sizes: f.enumOf(['S', 'M', 'L'], { list: true }),
	}),
	indexes: [{ fields: ['tags'] }, { fields: ['scores'] }],
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
		).toThrow('A list is never null: left out, it is []. Remove optional.')
		expect(() =>
			defineModel({
				name: 'Optional',
				// @ts-expect-error: a list is [] when empty.
				fields: (f) => ({ n: f.number({ list: true, optional: true }) }),
			}),
		).toThrow('A list is never null: left out, it is []. Remove optional.')
		expect(() =>
			defineModel({
				name: 'Unique',
				fields: (f) => ({
					// @ts-expect-error: a list cannot be unique.
					sizes: f.enumOf(['S'], { list: true, unique: true }),
				}),
			}),
		).toThrow('A list cannot be unique.')
	})

	it('holds strings, numbers or enum values only', () => {
		const lists = [
			// @ts-expect-error: a date makes no list.
			(f: Builders) => f.dateTime({ list: true }),
			// @ts-expect-error: a boolean makes no list.
			(f: Builders) => f.boolean({ list: true }),
			// @ts-expect-error: a json value makes no list.
			(f: Builders) => f.json({ list: true }),
		]
		for (const [at, type] of ['dateTime', 'boolean', 'json'].entries()) {
			expect(() =>
				defineModel({
					name: 'Listed',
					fields: (f) => ({ field: lists[at]?.(f) ?? f.string() }),
				}),
			).toThrow(
				`f.${type}() makes no list: a list holds strings, numbers or enum values.`,
			)
		}
	})

	it('reads and filters by its elements', () => {
		type Read = RecordOf<typeof Article>
		expectTypeOf<Read['scores']>().toEqualTypeOf<readonly number[]>()
		expectTypeOf<Read['sizes']>().toEqualTypeOf<readonly ('S' | 'M' | 'L')[]>()
		expectTypeOf<{
			has: 'S'
			hasSome: ['M']
			hasEvery: ['L']
			isEmpty: false
		}>().toExtend<NonNullable<WhereOf<typeof Article>['sizes']>>()
		expectTypeOf<{ has: 'XL' }>().not.toExtend<
			NonNullable<WhereOf<typeof Article>['sizes']>
		>()
		expectTypeOf<{ has: '1' }>().not.toExtend<
			NonNullable<WhereOf<typeof Article>['scores']>
		>()
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

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({
		name: f.string(),
		languages: f.enumOf(['fr', 'en', 'de'], {
			list: true,
			size: { min: 1 },
		}),
		tags: f.string({ list: true, size: { max: 2 } }),
	}),
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			if (data.name === 'filled') data.languages = ['fr']
			if (data.name === 'long') data.tags = ['a', 'b', 'c']
		},
		beforeUpdate: ({ data }) => {
			if (data.name === 'trimmed') data.languages = []
		},
	},
})

const Tagged = defineModel({
	name: 'Tagged',
	fields: (f) => ({
		tags: f.string({ list: true, size: { min: 1, max: 2 } }),
		shelf: f.one(() => Shelf, { optional: true }),
	}),
})

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ tagged: f.many(() => Tagged, { inverse: 'shelf' }) }),
})

const sized = (size: unknown, list = true) =>
	resolve([
		defineModel({
			name: 'Sized',
			fields: (f) => ({
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types may refuse.
				tags: f.string({ list, size } as { list: true }),
			}),
		}),
	])

const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})

describe('a list with a size', () => {
	let app: ReturnType<typeof defineApp>

	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Account, Tagged, Shelf] })
		await app.start()
	})

	afterEach(async () => {
		await app.stop()
	})

	it('refuses too few and too many values, for every caller', async () => {
		const least = refused('languages', 'Expected at least 1 value.')
		await expect(
			Account.create({ data: { name: 'a' } }, M),
		).rejects.toMatchObject(least)
		await expect(
			Account.create({ data: { name: 'a', languages: [] } }, M),
		).rejects.toMatchObject(least)
		await expect(
			Account.create(
				{ data: { name: 'a', languages: ['fr'], tags: ['a', 'b', 'c'] } },
				M,
			),
		).rejects.toMatchObject(refused('tags', 'Expected at most 2 values.'))
		expect(
			await Account.create(
				{ data: { name: 'a', languages: ['fr', 'en'], tags: ['a', 'b'] } },
				M,
			),
		).toMatchObject({ languages: ['fr', 'en'], tags: ['a', 'b'] })
	})

	it('is checked on the list a hook leaves', async () => {
		expect(await Account.create({ data: { name: 'filled' } }, M)).toMatchObject(
			{ languages: ['fr'] },
		)
		await expect(
			Account.create({ data: { name: 'long', languages: ['fr'] } }, M),
		).rejects.toMatchObject(refused('tags', 'Expected at most 2 values.'))
		const { id } = await Account.create(
			{ data: { name: 'a', languages: ['fr'] } },
			M,
		)
		await expect(
			Account.update({ where: { id }, data: { name: 'trimmed' } }, M),
		).rejects.toMatchObject(refused('languages', 'Expected at least 1 value.'))
	})

	it('holds on every write that gives the list, and only those', async () => {
		const least = refused('languages', 'Expected at least 1 value.')
		const { id } = await Account.create(
			{ data: { name: 'a', languages: ['fr'] } },
			M,
		)
		expect(
			await Account.update({ where: { id }, data: { name: 'b' } }, M),
		).toMatchObject({ name: 'b', languages: ['fr'] })
		await expect(
			Account.update({ where: { id }, data: { languages: [] } }, M),
		).rejects.toMatchObject(least)
		await expect(
			Account.updateMany({ where: { id }, data: { languages: [] } }, M),
		).rejects.toMatchObject(least)
		await expect(
			Account.createMany({ data: [{ name: 'c' }] }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			Account.upsert(
				{
					where: { id: 'missing' },
					create: { name: 'd', languages: [] },
					update: {},
				},
				M,
			),
		).rejects.toMatchObject(least)
	})

	it('holds on what a nested list operation leaves', async () => {
		const shelf = await Shelf.create({ data: {} }, M)
		const { id } = await Tagged.create(
			{ data: { tags: ['a'], shelf: { connect: { id: shelf.id } } } },
			M,
		)
		await expect(
			Shelf.update(
				{
					where: { id: shelf.id },
					data: {
						tagged: {
							update: [{ where: { id }, data: { tags: { remove: 'a' } } }],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		expect(await Tagged.findUnique({ where: { id } }, M)).toMatchObject({
			tags: ['a'],
		})
	})

	it('holds on what a list operation leaves, with no hook to read the row', async () => {
		const { id } = await Tagged.create({ data: { tags: ['a'] } }, M)
		const issue = refused('tags', 'Expected 1 to 2 values.')
		await expect(
			Tagged.update({ where: { id }, data: { tags: { remove: 'a' } } }, M),
		).rejects.toMatchObject(issue)
		await expect(
			Tagged.update({ where: { id }, data: { tags: { push: ['b', 'c'] } } }, M),
		).rejects.toMatchObject(issue)
		await expect(
			Tagged.updateMany({ where: { id }, data: { tags: { remove: 'a' } } }, M),
		).rejects.toMatchObject(issue)
		await expect(
			Tagged.updateManyAndReturn(
				{ where: { id }, data: { tags: { remove: 'a' } } },
				M,
			),
		).rejects.toMatchObject(issue)
		expect(await Tagged.findUnique({ where: { id } }, M)).toMatchObject({
			tags: ['a'],
		})
		expect(
			await Tagged.update({ where: { id }, data: { tags: { push: 'b' } } }, M),
		).toMatchObject({ tags: ['a', 'b'] })
	})

	it('says its bounds', () => {
		expect(listIssue({ min: 1, max: 10 }, [])).toBe('Expected 1 to 10 values.')
		expect(listIssue({ min: 2, max: 2 }, ['a'])).toBe(
			'Expected exactly 2 values.',
		)
		expect(listIssue({ min: 1, max: 1 }, ['a', 'b'])).toBe(
			'Expected exactly 1 value.',
		)
		expect(listIssue({ min: 1, max: 10 }, ['a'])).toBeUndefined()
	})

	it('types what it takes', () => {
		expectTypeOf<RecordOf<typeof Account>['languages']>().toEqualTypeOf<
			readonly ('fr' | 'en' | 'de')[]
		>()
		defineModel({
			name: 'Typed',
			fields: (f) => ({
				// @ts-expect-error: a list only.
				title: f.string({ size: { min: 1 } }),
			}),
		})
	})

	it('stops startup on a size out of order, or on no list', () => {
		const bad =
			'Sized.tags: size takes whole numbers, min from 0 and max from 1, as { min: 1, max: 10 }.'
		for (const size of [
			{ min: -1 },
			{ max: 0 },
			{ min: 3, max: 2 },
			{ min: 1.5 },
			{ least: 1 },
			1,
		]) {
			expect(() => sized(size)).toThrow(bad)
		}
		expect(() => sized({ min: 1 }, false)).toThrow(
			'Sized.tags: size bounds a list only.',
		)
	})

	it('bounds nothing with no bound, and shows its bound to the adapter', () => {
		for (const size of [{}, { min: 0 }]) {
			const { models } = sized(size)
			expect(models.get('Sized')?.fields.get('tags')).not.toHaveProperty('size')
		}
		const { models } = sized({ min: 1, max: 3 })
		expect(models.get('Sized')?.fields.get('tags')).toMatchObject({
			size: { min: 1, max: 3 },
		})
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
		const bad: [string, unknown, string][] = [
			['scores', [1, Number.NaN], 'Expected a list of finite numbers.'],
			['scores', ['1'], 'Expected a list of finite numbers.'],
			['sizes', ['S', 'XL'], 'Expected a list of values among S, M, L.'],
			['sizes', 'S', 'Expected a list of values among S, M, L.'],
		]
		for (const [path, value, message] of bad) {
			const data = { title: 'd', [path]: value }
			await expect(
				// @ts-expect-error: the test sends what the types refuse.
				Article.create({ data }, M),
			).rejects.toMatchObject({
				code: 'VALIDATION_FAILED',
				details: { issues: [{ path: [path], message }] },
			})
		}
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

	it('takes has, hasSome, hasEvery and isEmpty only, with clean strings', async () => {
		const refusals: [unknown, string][] = [
			[{ has: 5 }, 'where.tags.has must be a non-empty clean string.'],
			[{ has: '' }, 'where.tags.has must be a non-empty clean string.'],
			[{ hasSome: 'ts' }, 'where.tags.hasSome must be a list.'],
			[{ hasSome: ['ts', ''] }, 'where.tags.hasSome.1 must be'],
			[{ hasEvery: 'ts' }, 'where.tags.hasEvery must be a list.'],
			[{ hasEvery: ['\0'] }, 'where.tags.hasEvery.0 must be'],
			[{ isEmpty: 'yes' }, 'where.tags.isEmpty must be a boolean.'],
		]
		const elements: [string, unknown, string][] = [
			['scores', '1', 'where.scores.has must be a finite number.'],
			['scores', Infinity, 'where.scores.has must be a finite number.'],
			['sizes', 'XL', 'where.sizes.has must be one of S, M, L.'],
		]
		for (const [field, has, message] of elements) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
			const where = { [field]: { has } } as { tags: { has: string } }
			await expect(Article.findMany({ where }, M)).rejects.toMatchObject(
				invalid(message),
			)
		}
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

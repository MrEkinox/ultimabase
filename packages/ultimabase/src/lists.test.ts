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

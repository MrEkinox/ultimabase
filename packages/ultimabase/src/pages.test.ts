// A function's page (D-182): `Model.paginate` reads nothing until its rows
// or its count are read, as its caller, and a page is a query's output, at
// the root or in a type, never under a list or in a virtual.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import { asUser } from '@ultimabase/testing'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	defineType,
	master,
	memory,
} from './index.ts'
import { pageSource } from './internal.ts'

const M = { as: master }

// Each user reads their own notes.
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), rank: f.number(), owner: f.string() }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			(caller.kind === 'user' && where({ owner: caller.user.id })),
		create: allow.private,
	},
})

const Other = defineModel({ name: 'Other', fields: (f) => ({ a: f.string() }) })

const notes = defineFunction({
	name: 'notes',
	query: true,
	input: z.object({ above: z.number() }),
	output: Note.paginated(),
	run: ({ input, caller }) =>
		Note.paginate(
			{ where: { rank: { gt: input.above } }, orderBy: { rank: 'asc' } },
			{ as: caller },
		),
}).with({ access: () => true })

const Board = defineType({
	name: 'Board',
	fields: { title: z.string(), notes: Note.paginated() },
})
const Wall = defineType({
	name: 'Wall',
	fields: { board: Board.nullable() },
})
const wall = defineFunction({
	name: 'wall',
	query: true,
	output: Wall,
	run: () => ({
		board: { title: 'All', notes: Note.paginate({}, M) },
	}),
})

const texts = (rows: readonly { readonly text: string }[]): string[] =>
	rows.map(({ text }) => text)

describe('Model.paginate (D-182)', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({
			database: memory(),
			models: [Note, Other],
			functions: [notes, wall],
		})
		await app.start()
		await Note.createMany(
			{
				data: [1, 2, 3, 4].map((rank) => ({
					text: `n${rank}`,
					rank,
					owner: rank === 4 ? 'u2' : 'u1',
				})),
			},
			M,
		)
	})
	afterEach(async () => app.stop())

	it('reads its rows and counts them with its where, its order and its caller', async () => {
		const page = await notes.run({ above: 1 }, { as: asUser({ id: 'u1' }) })
		expectTypeOf(page).toEqualTypeOf<ReturnType<typeof Note.paginate>>()
		type Row = Awaited<ReturnType<typeof page.findMany>>[number]
		expectTypeOf<Row['text']>().toEqualTypeOf<string>()
		expect(texts(await page.findMany())).toStrictEqual(['n2', 'n3'])
		expect(await page.count()).toBe(2)
		expect(texts(await page.findMany({ take: 1, skip: 1 }))).toStrictEqual([
			'n3',
		])
		const [first] = await page.findMany({ take: 1 })
		const after = await page.findMany({ cursor: { id: first?.id ?? '' } })
		expect(texts(after)).toStrictEqual(['n2', 'n3'])
		expect(texts(await page.findMany({ take: -1 }))).toStrictEqual(['n3'])
		const all = Note.paginate({}, M)
		expect(await all.count()).toBe(4)
		const { board } = await wall.run(M)
		expect(await board?.notes.count()).toBe(4)
	})

	it('is not a Promise and reads nothing until asked', async () => {
		const page = Note.paginate({ where: { rank: 1 } }, M)
		expect('then' in page).toBe(false)
		await expect(Promise.resolve(page)).resolves.toBe(page)
		await app.stop()
		await expect(page.count()).rejects.toThrow('started')
		await app.start()
	})

	it('refuses an argument a page does not take', async () => {
		const loose: { paginate(args: unknown, options: unknown): unknown } = Note
		expect(() => loose.paginate({ take: 1 }, M)).toThrow(
			'Note.paginate takes where, orderBy, not take.',
		)
		expect(() => loose.paginate('all', M)).toThrow(
			'Note.paginate is an object.',
		)
		const page: { findMany(page: unknown): Promise<unknown> } = Note.paginate(
			{},
			M,
		)
		await expect(page.findMany({ where: {} })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'page.findMany takes take, skip, cursor, not where.',
		})
		// @ts-expect-error: a page takes where and orderBy.
		expect(() => Note.paginate({ take: 1 }, M)).toThrow('not take')
	})

	it('is read by a transport as a page of its model', () => {
		const page = Note.paginate({}, M)
		expect(pageSource(page, 'Note')).toBe(page)
		expect(() => pageSource(page, 'Other')).toThrow(
			'Expected Other.paginate(…), got a page of Note.',
		)
		expect(() => pageSource([], 'Note')).toThrow(
			'Expected Note.paginate(…), got another value.',
		)
	})
})

describe('Model.paginated (D-182)', () => {
	it('is a query', () => {
		expect(() =>
			// @ts-expect-error: a page is a query's output.
			defineFunction({
				name: 'mutation',
				output: Note.paginated(),
				run: () => Note.paginate(),
			}),
		).toThrow('mutation returns a page: give it query: true.')
		const Nested = defineType({
			name: 'Nested',
			fields: {
				inner: defineType({
					name: 'Inner',
					fields: { notes: Note.paginated() },
				}),
			},
		})
		expect(() =>
			// @ts-expect-error: a type holding a page is a query's output.
			defineFunction({
				name: 'deep',
				output: Nested.nullable(),
				run: () => null,
			}),
		).toThrow('deep returns a page: give it query: true.')
	})

	it('is refused under a list, at any depth', () => {
		expect(() =>
			defineFunction({
				name: 'boards',
				query: true,
				output: [Board],
				run: () => [],
			}),
		).toThrow('boards.output lists a type that holds a page.')
		expect(() =>
			defineType({ name: 'Walls', fields: { walls: [Wall] } }),
		).toThrow('Walls.walls lists a type that holds a page.')
		expect(() =>
			defineFunction({
				name: 'pages',
				query: true,
				// @ts-expect-error: a list holds a model or a type.
				output: [Note.paginated()],
				run: () => [],
			}),
		).toThrow('pages.output is a model, a type, a list of one')
	})

	it('has no nullable', () => {
		const page = Note.paginated()
		expect('nullable' in page).toBe(false)
	})

	it('is refused in a virtual, and for a model the application lacks', async () => {
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({
				notes: f.virtual(() => Board),
			}),
		})
		await expect(
			defineApp({ database: memory(), models: [Card, Note] }).start(),
		).rejects.toThrow('Card.notes is a virtual, which returns no page.')
		await expect(
			defineApp({
				database: memory(),
				models: [Other],
				functions: [notes],
			}).start(),
		).rejects.toThrow('notes returns Note, which is not in models.')
	})
})

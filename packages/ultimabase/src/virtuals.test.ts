// Virtual fields on `memory()` (D-151): computed on read by `run` or
// `runMany` as the caller, from the fields their `needs` list, typed by
// their output and input.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from 'vitest'
import { z } from 'zod'
import type { Logger } from './index.ts'
import {
	allow,
	defineApp,
	defineModel,
	defineType,
	master,
	memory,
} from './index.ts'
import { query } from './engine.ts'

const seen: unknown[] = []
const anId: unknown = expect.any(String)
const aDate: unknown = expect.any(Date)

const Summary = defineType({
	name: 'Summary',
	fields: { name: z.string(), size: z.number() },
})

const Stage = defineModel({
	name: 'Stage',
	fields: (f) => ({
		name: f.string(),
		cover: f.string(),
		secret: f.string({ default: 'hush' }).with({
			access: { read: allow.private },
		}),
		images: f.many(() => Image),
		label: f.virtual(z.string(), { needs: ['name'] }),
		thumb: f.virtual(z.string(), {
			input: z.object({ size: z.number().int().positive() }),
			needs: ['cover'],
		}),
		leak: f.virtual(z.string(), { needs: ['secret'] }),
		quiet: f.virtual(z.string()).with({ access: { read: allow.private } }),
		gallery: f.virtual(() => [Image], {
			input: z.object({ first: z.number().int().default(10) }),
		}),
		best: f.virtual(() => Image.nullable()),
		summary: f.virtual(() => Summary, { needs: ['name'] }),
		caller: f.virtual(z.string()),
	}),
}).with({
	access: allow.public,
	virtuals: {
		label: {
			run: ({ record }) => {
				seen.push(record)
				return record.name.toUpperCase()
			},
		},
		thumb: { run: ({ record, input }) => `${record.cover}?w=${input.size}` },
		leak: { run: ({ record }) => record.secret },
		quiet: { run: () => 'quiet' },
		gallery: {
			runMany: async ({ caller, input, records }) => {
				const ids = records.map((record) => record.id)
				const all = await Image.findMany(
					{
						where: { stage: { is: { id: { in: ids } } } },
						include: { stage: { select: { id: true } } },
						orderBy: { url: 'asc' },
					},
					{ as: caller },
				)
				return records.map((record) =>
					all
						.filter((image) => image.stage?.id === record.id)
						.slice(0, input.first),
				)
			},
		},
		best: {
			run: async ({ record }) =>
				Image.findFirst(
					{
						where: { stage: { is: { id: record.id } } },
						orderBy: { url: 'asc' },
					},
					{ as: master },
				),
		},
		summary: { run: ({ record }) => ({ name: record.name, size: 2 }) },
		caller: { run: ({ caller }) => caller.kind },
	},
})

const Image = defineModel({
	name: 'Image',
	fields: (f) => ({
		url: f.string(),
		hidden: f.boolean({ default: false }),
		stage: f.one(() => Stage, { onDelete: 'cascade' }),
		tags: f.many(() => Tag),
		big: f.virtual(z.string(), { needs: ['url'] }),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }) },
	virtuals: { big: { run: ({ record }) => record.url.toUpperCase() } },
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string(),
		image: f.one(() => Image, { onDelete: 'cascade' }),
	}),
}).with({ access: allow.public })

const logged: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (first: unknown, message?: string) => {
		logged.push(message ?? first)
	},
	error: () => undefined,
	child: () => logger,
}

const M = { as: master }
let app: ReturnType<typeof defineApp>
let stage: string

beforeEach(async () => {
	seen.length = 0
	logged.length = 0
	app = defineApp({ database: memory(), logger, models: [Stage, Image, Tag] })
	await app.start()
	const created = await Stage.create(
		{
			data: {
				name: 'one',
				cover: 'c.png',
				images: {
					create: [
						{ url: 'b', tags: { create: [{ name: 'x' }] } },
						{ url: 'a' },
						{ url: 'c', hidden: true },
					],
				},
			},
		},
		M,
	)
	stage = created.id
	await Stage.create({ data: { name: 'two', cover: 'd.png' } }, M)
})
afterEach(async () => app.stop())

const read = async (select: object, options: object = {}) =>
	query('Stage', 'findUniqueOrThrow', { where: { id: stage }, select }, options)

describe('a virtual', () => {
	it('of a scalar without input is in the default row', async () => {
		seen.length = 0
		const found = await Stage.findUniqueOrThrow({ where: { id: stage } }, M)
		expect(found).toMatchObject({ name: 'one', label: 'ONE', leak: 'hush' })
		expect(Object.keys(found)).not.toContain('thumb')
		expect(seen).toStrictEqual([{ id: stage, name: 'one' }])
		const omitted = await Stage.findUniqueOrThrow(
			{ where: { id: stage }, omit: { label: true } },
			M,
		)
		expect(Object.keys(omitted)).not.toContain('label')
		expectTypeOf(found.label).toEqualTypeOf<string>()
		expectTypeOf(omitted).not.toHaveProperty('label')
	})

	it('reads its needs when they are not selected', async () => {
		expect(await read({ thumb: { size: 200 } })).toStrictEqual({
			thumb: 'c.png?w=200',
		})
		expect(await read({ label: true, summary: true })).toStrictEqual({
			label: 'ONE',
			summary: { name: 'one', size: 2 },
		})
	})

	it('validates its input once per request', async () => {
		await expect(read({ thumb: { size: -1 } })).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['select', 'thumb', 'size'] }] },
		})
		await expect(read({ label: { size: 1 } })).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'select.label.size',
		})
	})

	it('returns rows shaped by their select, relations re-read', async () => {
		const found = await read({
			gallery: {
				first: 1,
				select: {
					url: true,
					big: true,
					tags: { select: { name: true } },
					_count: true,
				},
			},
			best: true,
		})
		expect(found).toStrictEqual({
			gallery: [{ url: 'a', big: 'A', tags: [], _count: { tags: 0 } }],
			best: {
				id: anId,
				createdAt: aDate,
				updatedAt: aDate,
				url: 'a',
				hidden: false,
				big: 'A',
			},
		})
		const all = await read({
			gallery: { include: { tags: true }, omit: { hidden: true } },
		})
		expect(all).toMatchObject({
			gallery: [
				{ url: 'a', tags: [] },
				{ url: 'b', tags: [{ name: 'x' }] },
			],
		})
	})

	it('gives a row the caller cannot read no relations', async () => {
		const Hidden = defineModel({
			name: 'Box',
			fields: (f) => ({
				items: f.virtual(() => [Image]),
			}),
		}).with({
			access: allow.public,
			virtuals: {
				items: {
					run: async () =>
						Image.findMany({ where: { hidden: true } }, { as: master }),
				},
			},
		})
		await app.stop()
		app = defineApp({ database: memory(), models: [Hidden, Stage, Image, Tag] })
		await app.start()
		await Image.create(
			{
				data: {
					url: 'h',
					hidden: true,
					stage: { create: { name: 's', cover: 'c' } },
					tags: { create: [{ name: 'y' }] },
				},
			},
			M,
		)
		await Hidden.create({ data: {} }, M)
		const found = await Hidden.findFirstOrThrow(
			{ select: { items: { select: { url: true, tags: true } } } },
			{},
		)
		expect(found).toStrictEqual({ items: [{ url: 'h', tags: [] }] })
	})

	it('runs as the caller', async () => {
		expect(await read({ caller: true })).toStrictEqual({
			caller: 'anonymous',
		})
		expect(await read({ caller: true }, M)).toStrictEqual({ caller: 'master' })
		const anonymous = await read({ gallery: { select: { url: true } } })
		expect(anonymous).toStrictEqual({ gallery: [{ url: 'a' }, { url: 'b' }] })
	})

	it('is hidden with a need or its own read rule', async () => {
		const found = await Stage.findUniqueOrThrow({ where: { id: stage } }, {})
		expect(Object.keys(found)).not.toContain('leak')
		expect(Object.keys(found)).not.toContain('secret')
		expect(await read({ quiet: true })).toStrictEqual({})
		expect(await read({ quiet: true }, M)).toStrictEqual({ quiet: 'quiet' })
	})

	it('is computed for included relations and returned writes', async () => {
		const image = await Image.findFirstOrThrow(
			{ where: { url: 'a' }, include: { stage: true } },
			M,
		)
		expect(image).toMatchObject({ big: 'A', stage: { label: 'ONE' } })
		const made = await Stage.create(
			{ data: { name: 'new', cover: 'n' }, select: { thumb: { size: 1 } } },
			M,
		)
		expect(made).toStrictEqual({ thumb: 'n?w=1' })
		// Its virtuals see the row before the delete cascades to its images.
		const gone = await Stage.delete(
			{
				where: { id: stage },
				select: { best: { select: { url: true } }, label: true },
			},
			M,
		)
		expect(gone).toStrictEqual({ best: { url: 'a' }, label: 'ONE' })
		expect(await Image.count({}, M)).toBe(0)
	})

	it('is never in where, orderBy or data', async () => {
		await expect(
			query('Stage', 'findMany', { where: { label: 'ONE' } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		await expect(
			query('Stage', 'findMany', { orderBy: { label: 'asc' } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		await expect(
			query(
				'Stage',
				'create',
				{ data: { name: 'a', cover: 'b', label: 'c' } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		expect(typed).toBeTypeOf('function')
	})

	it('warns, outside production, when run queries once per row', async () => {
		await Stage.findMany({ select: { best: true, gallery: true } }, M)
		await Stage.findMany({ select: { best: true } }, M)
		expect(logged).toStrictEqual([
			'Stage.best: run queried the database once per row; use runMany.',
		])
		const Slow = defineModel({
			name: 'Slow',
			fields: (f) => ({ count: f.virtual(z.number()) }),
		}).with({
			access: allow.public,
			virtuals: { count: { run: async () => Image.count({}, M) } },
		})
		await app.stop()
		vi.stubEnv('NODE_ENV', 'production')
		app = defineApp({
			database: memory(),
			logger,
			models: [Slow, Image, Stage, Tag],
		})
		await app.start()
		await Slow.createMany({ data: [{}, {}] }, M)
		logged.length = 0
		await Slow.findMany({}, M)
		vi.unstubAllEnvs()
		expect(logged).toStrictEqual([])
	})
})

/** Reads a model whose rule its types would refuse. */
const readOdd = async (rule: object) => {
	const Odd = defineModel({
		name: 'Odd',
		fields: (f) => ({ value: f.virtual(z.string()) }),
	})
	Reflect.apply(Reflect.get(Odd, 'with'), Odd, [
		{ access: allow.public, virtuals: rule },
	])
	await app.stop()
	app = defineApp({ database: memory(), models: [Odd] })
	await app.start()
	await Odd.create({ data: {} }, M)
	return Odd.findMany({}, M)
}

describe('a virtual', () => {
	it('fails the call when run throws', async () => {
		await expect(
			readOdd({
				value: {
					run: () => {
						throw new Error('broken')
					},
				},
			}),
		).rejects.toThrow('broken')
	})

	it('fails the call when runMany returns another length', async () => {
		await expect(readOdd({ value: { runMany: () => [] } })).rejects.toThrow(
			'Odd.value: runMany returns one value per record, 1 here.',
		)
	})
})

/** Calls the method `name` of `target`, which its types do not know. */
const call = (target: unknown, name: string, args: readonly unknown[]) => {
	const method: unknown = Reflect.get(Object(target), name)
	if (typeof method !== 'function') throw new TypeError(`No ${name}.`)
	const result: unknown = Reflect.apply(method, target, args)
	return result
}

/** The field builders, as a definition its types would refuse calls them. */
type Builders = {
	readonly string: () => unknown
	readonly virtual: (...args: readonly unknown[]) => unknown
}

/** Starts an application with `Shelf`, whose fields and rules are given. */
const start = async (
	fields: { readonly [name: string]: (f: Builders) => unknown },
	virtuals: object,
) => {
	const Shelf: unknown = Reflect.apply(defineModel, undefined, [
		{
			name: 'Shelf',
			fields: (f: Builders) => ({
				label: f.string(),
				...Object.fromEntries(
					Object.entries(fields).map(([name, make]) => [name, make(f)]),
				),
			}),
		},
	])
	call(Shelf, 'with', [{ virtuals }])
	const started: unknown = Reflect.apply(defineApp, undefined, [
		{ database: memory(), models: [Shelf] },
	])
	return call(started, 'start', [])
}

describe('a virtual', () => {
	const plain = { v: (f: Builders) => f.virtual(z.string()) }
	const rule = { v: { run: () => 'x' } }

	it('stops startup without one rule', async () => {
		await expect(start(plain, {})).rejects.toThrow(
			'Shelf.v is virtual; give its run or runMany in .with({ virtuals }).',
		)
		await expect(
			start(plain, { v: { run: () => 'x', runMany: () => [] } }),
		).rejects.toThrow('Shelf.v: give run or runMany, one of them.')
		await expect(start(plain, { ...rule, w: rule.v })).rejects.toThrow(
			'Shelf.virtuals.w names no virtual field.',
		)
	})

	it('stops startup on a bad output, input or needs', async () => {
		await expect(
			start({ v: (f: Builders) => f.virtual(() => Stage) }, rule),
		).rejects.toThrow('Shelf.v: its output model is not in models.')
		await expect(
			start({ v: (f: Builders) => f.virtual(1) }, rule),
		).rejects.toThrow(
			'Shelf.v is a Standard Schema, or a model or a type behind an arrow.',
		)
		await expect(
			start(
				{
					v: (f: Builders) => f.virtual(z.string(), { input: 'size' }),
				},
				rule,
			),
		).rejects.toThrow('Shelf.v: input is a Standard Schema of an object.')
		await expect(
			start(
				{
					v: (f: Builders) =>
						f.virtual(z.string(), { input: z.object({ select: z.string() }) }),
				},
				rule,
			),
		).rejects.toThrow(
			"Shelf.v: no input property is named select, which shapes a model's rows.",
		)
		await expect(
			start(
				{
					v: (f: Builders) => f.virtual(z.string(), { needs: ['v'] }),
				},
				rule,
			),
		).rejects.toThrow('Shelf.v needs v, no scalar field.')
	})
})

// Compile-time cases, never run.
const typed = async () => {
	const found = await Stage.findUniqueOrThrow(
		{
			where: { id: stage },
			select: {
				thumb: { size: 3 },
				gallery: { select: { url: true } },
				best: true,
				summary: true,
			},
		},
		M,
	)
	expectTypeOf(found.thumb).toEqualTypeOf<string>()
	expectTypeOf(found.gallery).toEqualTypeOf<{ readonly url: string }[]>()
	expectTypeOf(found.best?.url).toEqualTypeOf<string | undefined>()
	expectTypeOf(found.summary.size).toEqualTypeOf<number>()
	const included = await Stage.findFirstOrThrow(
		{ include: { gallery: true } },
		M,
	)
	expectTypeOf(included.gallery[0]?.url).toEqualTypeOf<string | undefined>()
	const plain = await Image.findFirstOrThrow({}, M)
	expectTypeOf(plain.big).toEqualTypeOf<string>()
	// @ts-expect-error -- no where on a virtual
	await Stage.findMany({ where: { label: 'x' } }, M)
	// @ts-expect-error -- no orderBy on a virtual
	await Stage.findMany({ orderBy: { label: 'asc' } }, M)
	// @ts-expect-error -- its input is needed
	await Stage.findMany({ select: { thumb: true } }, M)
	// @ts-expect-error -- no data writes a virtual
	await Stage.create({ data: { name: 'a', cover: 'b', label: 'c' } }, M)
	// @ts-expect-error -- no data writes a virtual
	await Stage.update({ where: { id: 'x' }, data: { label: 'c' } }, M)
	defineModel({
		name: 'Bad',
		fields: (f) => ({
			a: f.string(),
			b: f.string(),
			v: f.virtual(z.string(), { needs: ['a'] }),
		}),
	}).with({
		virtuals: {
			// @ts-expect-error -- reads a field it does not need
			v: { run: ({ record }) => (record.b === 'b' ? 'x' : 'y') },
		},
	})
	defineModel({
		name: 'Bad',
		fields: (f) => ({ v: f.virtual(z.string()) }),
	}).with({
		// @ts-expect-error -- run and runMany
		virtuals: { v: { run: () => 'x', runMany: () => ['x'] } },
	})
	defineModel({
		name: 'Bad',
		fields: (f) => ({ v: f.virtual(z.string()) }),
	}).with({
		// @ts-expect-error -- returns a number
		virtuals: { v: { run: () => 1 } },
	})
	defineModel({
		name: 'Bad',
		fields: (f) => ({ v: f.virtual(z.string()) }),
		// @ts-expect-error -- no rule for a virtual
	}).with({ virtuals: {} })
	defineModel({
		name: 'Bad',
		fields: (f) => ({ v: f.virtual(() => [Image]) }),
	}).with({
		virtuals: {
			// @ts-expect-error -- returns stages, not images
			v: { run: async () => Stage.findMany({}, M) },
		},
	})
	defineModel({
		name: 'Bad',
		fields: (f) => ({ v: f.virtual(z.string(), { needs: ['nope'] }) }),
		// @ts-expect-error -- needs a field the model lacks
	}).with({ virtuals: { v: { run: () => 'x' } } })
}

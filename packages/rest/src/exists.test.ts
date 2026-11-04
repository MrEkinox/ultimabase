// An `exists` over REST (D-246): read and filtered as a boolean, in no data
// input and no `orderBy`.
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rest } from './index.ts'
import { at, call, M, qs, started } from './test/app.ts'

const Writer = defineModel({
	name: 'Writer',
	use: [rest()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		notes: f.many(() => Note, { inverse: 'writer' }),
		hasPinned: f.exists(() => Note, { from: 'notes' }),
	}),
}).with({
	access: allow.public,
	relations: { hasPinned: { where: ({ where }) => where({ pinned: true }) } },
})

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({
		title: f.string(),
		pinned: f.boolean({ default: false }),
		writer: f.one(() => Writer),
	}),
}).with({ access: allow.public })

let running: Awaited<ReturnType<typeof started>>
beforeAll(async () => {
	running = await started({}, memory(), [], [Writer, Note])
	await Writer.create(
		{
			data: {
				name: 'Ada',
				notes: { create: [{ title: 'Top', pinned: true }, { title: 'Other' }] },
			},
		},
		M,
	)
	await Writer.create(
		{ data: { name: 'Bob', notes: { create: [{ title: 'Draft' }] } } },
		M,
	)
})
afterAll(async () => running.app.stop())

const names = async (params: Record<string, unknown>): Promise<unknown> => {
	const { body } = await call(
		running.url,
		'GET',
		`/api/writers${qs({ orderBy: { name: 'asc' }, ...params })}`,
	)
	const edges = at(body, 'edges')
	return Array.isArray(edges) ? edges.map((edge) => at(edge, 'node')) : edges
}

describe('an exists over REST', () => {
	it('is read by select and include', async () => {
		expect(
			await names({ select: { name: true, hasPinned: true } }),
		).toStrictEqual([
			{ name: 'Ada', hasPinned: true },
			{ name: 'Bob', hasPinned: false },
		])
		const included = await names({ include: { hasPinned: true } })
		expect(at(included, 0, 'hasPinned')).toBe(true)
		expect(at(included, 1, 'hasPinned')).toBe(false)
	})

	it('filters on a boolean', async () => {
		const select = { name: true }
		expect(await names({ where: { hasPinned: true }, select })).toStrictEqual([
			{ name: 'Ada' },
		])
		expect(await names({ where: { hasPinned: false }, select })).toStrictEqual([
			{ name: 'Bob' },
		])
	})

	it('is a boolean in OpenAPI, in no data input and no orderBy', async () => {
		const { body } = await call(running.url, 'GET', '/api/openapi.json')
		const schema = (name: string) => at(body, 'components', 'schemas', name)
		const keys = (name: string) =>
			Object.keys(at(schema(name), 'properties') ?? {})
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keys(name)).toContain('notes')
			expect(keys(name)).not.toContain('hasPinned')
		}
		expect(keys('WriterOrderByInput')).toContain('notes')
		expect(keys('WriterOrderByInput')).not.toContain('hasPinned')
		const boolean = { type: 'boolean' }
		for (const name of ['Writer', 'WriterWhereInput', 'WriterInclude']) {
			expect(at(schema(name), 'properties', 'hasPinned')).toEqual(boolean)
		}
		expect(at(schema('WriterSelect'), 'properties', 'hasPinned')).toEqual(
			boolean,
		)
	})
})

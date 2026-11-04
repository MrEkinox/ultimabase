// A `one` view over REST (D-240): read by include and a nested select, in no
// data input and no `orderBy`.
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
		pinned: f.one(() => Note, { from: 'notes' }),
	}),
}).with({
	access: allow.public,
	relations: { pinned: { where: ({ where }) => where({ pinned: true }) } },
})

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({
		title: f.string(),
		pinned: f.boolean({ default: false }),
		writer: f.one(() => Writer),
	}),
	indexes: [{ fields: ['writer'], unique: true, where: { pinned: true } }],
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
	await Writer.create({ data: { name: 'Bob' } }, M)
})
afterAll(async () => running.app.stop())

const get = (path: string, params: Record<string, unknown>) =>
	call(running.url, 'GET', `${path}${qs(params)}`)

describe('a one view over REST', () => {
	it('is read by include and a nested select', async () => {
		const included = await get('/api/writers', {
			orderBy: { name: 'asc' },
			select: { name: true, pinned: { select: { title: true } } },
		})
		expect(at(included.body, 'edges', 0, 'node')).toEqual({
			name: 'Ada',
			pinned: { title: 'Top' },
		})
		expect(at(included.body, 'edges', 1, 'node')).toEqual({
			name: 'Bob',
			pinned: null,
		})
		const filtered = await get('/api/writers', {
			where: { pinned: { is: null } },
			select: { name: true },
		})
		expect(at(filtered.body, 'edges', 0, 'node')).toEqual({ name: 'Bob' })
	})

	it('is in no data input and no orderBy', async () => {
		const { body } = await call(running.url, 'GET', '/api/openapi.json')
		const keys = (name: string) =>
			Object.keys(at(body, 'components', 'schemas', name, 'properties') ?? {})
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keys(name)).toContain('notes')
			expect(keys(name)).not.toContain('pinned')
		}
		expect(keys('WriterOrderByInput')).toContain('notes')
		expect(keys('WriterOrderByInput')).not.toContain('pinned')
		expect(keys('WriterWhereInput')).toContain('pinned')
	})
})

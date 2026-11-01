// `viewer` on `memory()` (D-189): a relation filter that the kernel reads
// with the caller, as `is`, `isNot`, `some` or `none` of its user's id.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { query } from './engine.ts'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const users = definePlugin({ name: 'users', userModel: true })

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({
		name: f.string(),
		owned: f.many(() => Project, { inverse: 'owner' }),
		joined: f.many(() => Project, { inverse: 'members' }),
	}),
}).with({ access: allow.public })

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		name: f.string(),
		owner: f.one(() => Account, { optional: true, inverse: 'owned' }),
		members: f.many(() => Account, { inverse: 'joined' }),
		tag: f.one(() => Tag, { optional: true }),
	}),
}).with({ access: allow.public })

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ name: f.string(), projects: f.many(() => Project) }),
}).with({ access: allow.public })

// A variable, so no excess property check: without `Register`, no filter
// has `viewer` in TypeScript (D-189 point 5).
const joined = { viewer: true, none: undefined }

// The rule's own filter reads `viewer` with the caller too.
const Report = defineModel({
	name: 'Report',
	fields: (f) => ({ title: f.string(), readers: f.many(() => Reader) }),
}).with({
	access: { read: ({ where }) => where({ readers: joined }) },
})

const Reader = defineModel({
	name: 'Reader',
	use: [users.use()],
	fields: (f) => ({ reports: f.many(() => Report) }),
}).with({ access: allow.public })

let app: ReturnType<typeof defineApp>
let ada: string
let bob: string

const names = async (where: object, as: unknown): Promise<unknown> => {
	const rows: unknown = await query(
		'Project',
		'findMany',
		{ where, orderBy: { name: 'asc' }, select: { name: true } },
		{ as },
	)
	return Array.isArray(rows)
		? rows.map((row: unknown): unknown => Reflect.get(Object(row), 'name'))
		: rows
}

const titles = async (as: unknown): Promise<unknown> =>
	query('Report', 'findMany', { select: { title: true } }, { as })

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Account, Project, Tag],
		plugins: [users.plugin()],
	})
	await app.start()
	const M = { as: master }
	ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
	bob = (await Account.create({ data: { name: 'Bob' } }, M)).id
	const tag = await Tag.create({ data: { name: 'open' } }, M)
	const data = [
		{ name: 'Engine', owner: ada, members: [ada, bob] },
		{ name: 'Loom', owner: bob, members: [ada] },
		{ name: 'Orphan', owner: undefined, members: [] },
	]
	for (const { name, owner, members } of data) {
		await Project.create(
			{
				data: {
					name,
					...(owner === undefined ? {} : { owner: { connect: { id: owner } } }),
					members: { connect: members.map((id) => ({ id })) },
					tag: { connect: { id: tag.id } },
				},
			},
			M,
		)
	}
})

afterEach(async () => {
	await app.stop()
})

describe('viewer on a one relation', () => {
	it('is the caller’s user, or another row or none', async () => {
		const as = asUser({ id: ada })
		expect(await names({ owner: { viewer: true } }, as)).toEqual(['Engine'])
		expect(await names({ owner: { viewer: false } }, as)).toEqual([
			'Loom',
			'Orphan',
		])
	})

	it('holds with the relation’s other operators', async () => {
		const as = asUser({ id: ada })
		const where = { owner: { viewer: false, is: { name: 'Bob' } } }
		expect(await names(where, as)).toEqual(['Loom'])
	})
})

describe('viewer on a many relation', () => {
	it('is one of the related rows, or none of them', async () => {
		const as = asUser({ id: bob })
		expect(await names({ members: { viewer: true } }, as)).toEqual(['Engine'])
		expect(await names({ members: { viewer: false } }, as)).toEqual([
			'Loom',
			'Orphan',
		])
		const shared = { members: { viewer: true }, owner: { viewer: false } }
		expect(await names(shared, asUser({ id: ada }))).toEqual(['Loom'])
	})

	it('is read through a relation of another model', async () => {
		const tags: unknown = await query(
			'Tag',
			'count',
			{ where: { projects: { some: { owner: { viewer: true } } } } },
			{ as: asUser({ id: ada }) },
		)
		expect(tags).toBe(1)
	})
})

describe('a caller that is no user', () => {
	it('matches no row with true, every row with false', async () => {
		for (const as of [{ kind: 'anonymous' }, master]) {
			expect(await names({ owner: { viewer: true } }, as)).toEqual([])
			expect(await names({ members: { viewer: true } }, as)).toEqual([])
			expect(await names({ owner: { viewer: false } }, as)).toEqual([
				'Engine',
				'Loom',
				'Orphan',
			])
		}
	})
})

describe('invalid viewer filters', () => {
	it('refuses a relation to another model, and what is no boolean', async () => {
		const as = asUser({ id: ada })
		await expect(names({ tag: { viewer: true } }, as)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'where.tag.viewer: Project.tag is no relation to the user model.',
		})
		await expect(names({ owner: { viewer: 1 } }, as)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'where.owner.viewer must be a boolean.',
		})
	})

	it('fails on every relation without a user model', async () => {
		const Writer = defineModel({
			name: 'Writer',
			fields: (f) => ({ notes: f.many(() => Note) }),
		}).with({ access: allow.public })
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ writer: f.one(() => Writer) }),
		}).with({ access: allow.public })
		await app.stop()
		app = defineApp({ database: memory(), models: [Writer, Note] })
		await app.start()
		const counted = query(
			'Note',
			'count',
			{ where: { writer: { viewer: false } } },
			{ as: asUser({ id: ada }) },
		)
		await expect(counted).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'where.writer.viewer: Note.writer is no relation to the user model.',
		})
	})
})

it('reads viewer in an access rule’s filter', async () => {
	await app.stop()
	app = defineApp({
		database: memory(),
		models: [Report, Reader],
		plugins: [users.plugin()],
	})
	await app.start()
	const M = { as: master }
	const reader = await Reader.create({ data: {} }, M)
	await Report.create(
		{ data: { title: 'Read', readers: { connect: [{ id: reader.id }] } } },
		M,
	)
	await Report.create({ data: { title: 'Unread' } }, M)
	expect(await titles(asUser({ id: reader.id }))).toEqual([{ title: 'Read' }])
	expect(await titles({ kind: 'anonymous' })).toEqual([])
})

it('refuses two user models', async () => {
	await app.stop()
	app = defineApp({
		database: memory(),
		models: [Account, Project, Tag, Report, Reader],
		plugins: [users.plugin()],
	})
	await expect(app.start()).rejects.toThrow(
		'Account and Reader each use a plugin of the user model; one model does.',
	)
	app = defineApp({ database: memory(), models: [] })
	await app.start()
})

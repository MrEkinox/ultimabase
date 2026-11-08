// An update or a delete by a unique field whose rules need no stored row
// loads none: its checks stand for the read, with the same errors (D-342).
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	allow,
	defineApp,
	defineModel,
	master,
	memory,
	PublicError,
} from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

const notOwner = new PublicError('NOT_OWNER', 'Only its owner edits a note.')

let reads = 0
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		owner: f.string(),
		text: f.string({ search: true }),
		secret: f
			.string({ default: 's' })
			.with({ access: { read: allow.private } }),
		pinned: f
			.boolean({ default: false })
			.with({ access: { update: ({ value }) => !value } }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'user' && where({ owner: { not: 'eve' } }),
		create: () => true,
		update: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({ owner: { equals: caller.user.id } }, notOwner),
		delete: ({ caller, where }) =>
			caller.kind === 'user' &&
			where({ owner: { equals: caller.user.id } }, notOwner),
	},
})

/** A model whose update rule reads the stored row. */
const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({ owner: f.string(), text: f.string() }),
}).with({
	access: {
		read: allow.public,
		update: ({ caller, record }) => {
			reads += 1
			return caller.kind === 'user' && record.owner === caller.user.id
		},
	},
})

/** A model whose update rule searches its rows. */
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string({ search: true }) }),
}).with({
	access: {
		read: allow.public,
		update: ({ where }) => where({ _search: 'apple' }, notOwner),
	},
})

async function refusal(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run()
	} catch (error) {
		if (error instanceof PublicError) {
			return { code: error.code, details: error.details }
		}
		throw error
	}
	return undefined
}

let app: ReturnType<typeof defineApp>
let ids: { mine: string; theirs: string; hidden: string }
beforeEach(async () => {
	reads = 0
	app = defineApp({ database: memory(), models: [Note, Memo, Post] })
	await app.start()
	const note = async (owner: string) =>
		(await Note.create({ data: { owner, text: owner } }, M)).id
	ids = { mine: await note('ada'), theirs: await note('bob'), hidden: '' }
	ids.hidden = await note('eve')
})
afterEach(async () => app.stop())

const missing = '01900000-0000-7000-8000-000000000000'
const texts = async (): Promise<string[]> =>
	(await Note.findMany({ orderBy: { owner: 'asc' } }, M)).map((n) => n.text)

const update = (id: string, data: object) =>
	refusal(async () => Note.update({ where: { id }, data }, ada))

const remove = (id: string) =>
	refusal(async () => Note.delete({ where: { id } }, ada))

describe('an update that loads no row', () => {
	it('writes a row inside the filter, its hidden fields left out', async () => {
		const note = await Note.update(
			{ where: { id: ids.mine }, data: { text: 'u' } },
			ada,
		)
		expect(note).toMatchObject({ text: 'u' })
		expect(note).not.toHaveProperty('secret')
		expect(await texts()).toEqual(['u', 'bob', 'eve'])
	})

	it('fails as the loaded write does', async () => {
		expect(await update(missing, { text: 'u' })).toMatchObject({
			code: 'NOT_FOUND',
		})
		expect(await update(ids.hidden, { text: 'u' })).toMatchObject({
			code: 'NOT_FOUND',
		})
		expect(await update(ids.theirs, { text: 'u' })).toMatchObject({
			code: 'NOT_OWNER',
		})
		expect(await update(ids.mine, { pinned: true })).toMatchObject({
			code: 'ACCESS_DENIED',
			details: { model: 'Note', operation: 'update', field: 'pinned' },
		})
		expect(await texts()).toEqual(['ada', 'bob', 'eve'])
	})

	it('checks the row after a write that changes a field the filter reads', async () => {
		expect(await update(ids.mine, { owner: 'bob' })).toMatchObject({
			code: 'NOT_OWNER',
		})
		expect(await Note.count({ where: { owner: 'ada' } }, M)).toBe(1)
	})

	it('loads the row for a rule that reads it', async () => {
		const memo = async (owner: string) =>
			(await Memo.create({ data: { owner, text: owner } }, M)).id
		const [mine, theirs] = [await memo('ada'), await memo('bob')]
		reads = 0
		await Memo.update({ where: { id: mine }, data: { text: 'u' } }, ada)
		const refused = await refusal(async () =>
			Memo.update({ where: { id: theirs }, data: { text: 'u' } }, ada),
		)
		expect(refused).toMatchObject({ code: 'ACCESS_DENIED' })
		// Each rule runs on no row, which it reads, then on the row.
		expect(reads).toBe(4)
	})

	it('checks a searched row after its update', async () => {
		const { id } = await Post.create({ data: { title: 'apple' } }, M)
		const refused = await refusal(async () =>
			Post.update({ where: { id }, data: { title: 'pear' } }, ada),
		)
		expect(refused).toMatchObject({ code: 'NOT_OWNER' })
		await Post.update({ where: { id }, data: { title: 'apple pie' } }, ada)
		expect(await Post.count({}, M)).toBe(1)
	})
})

describe('a delete that loads no row', () => {
	it('fails as the loaded delete does', async () => {
		expect(await remove(missing)).toMatchObject({ code: 'NOT_FOUND' })
		expect(await remove(ids.hidden)).toMatchObject({ code: 'NOT_FOUND' })
		expect(await remove(ids.theirs)).toMatchObject({ code: 'NOT_OWNER' })
		expect(await texts()).toEqual(['ada', 'bob', 'eve'])
	})

	it('returns the row it removed, its hidden fields left out', async () => {
		const removed = await Note.delete({ where: { id: ids.mine } }, ada)
		expect(removed).toMatchObject({ text: 'ada' })
		expect(removed).not.toHaveProperty('secret')
		expect(await texts()).toEqual(['bob', 'eve'])
	})
})

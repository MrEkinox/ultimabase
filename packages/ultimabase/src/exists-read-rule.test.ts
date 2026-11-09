// An `exists` with `readRule: false` (D-359): it reads whether its view
// keeps a row the caller cannot read, as a boolean only; `beforeFind` still
// narrows, and no other read sees those rows.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const users = definePlugin({ name: 'users', userModel: true })

// Variables, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const me = { viewer: true, isNot: undefined }
const mine = { fromUser: me }

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({
		name: f.string(),
		sentBlocks: f.many(() => Block, { inverse: 'fromUser' }),
		receivedBlocks: f.many(() => Block, { inverse: 'toUser' }),
		hasBlockedMe: f.exists(() => Block, {
			from: 'sentBlocks',
			readRule: false,
		}),
		blocksOfMe: f.many(() => Block, { from: 'sentBlocks' }),
	}),
}).with({
	access: allow.public,
	relations: {
		hasBlockedMe: { where: ({ where }) => where({ toUser: me }) },
		blocksOfMe: { where: ({ where }) => where({ toUser: me }) },
	},
})

const Block = defineModel({
	name: 'Block',
	fields: (f) => ({
		trashed: f.boolean({ default: false }),
		fromUser: f.one(() => Account),
		toUser: f.one(() => Account),
	}),
}).with({
	access: {
		read: ({ where }) => where(mine),
		create: allow.public,
		update: allow.public,
		delete: allow.public,
	},
	hooks: { beforeFind: ({ where }) => where({ trashed: false }) },
})

const M = { as: master }

let app: ReturnType<typeof defineApp>
let ada = ''
let eve = ''
let block = ''

/** Each account's name and `hasBlockedMe`, read as `as`, a user id or Master. */
const read = async (as: unknown) =>
	Account.findMany(
		{
			orderBy: { name: 'asc' },
			select: { name: true, hasBlockedMe: true },
		},
		{ as: as === master ? master : asUser({ id: String(as) }) },
	)

const names = (rows: readonly { readonly name: string }[]) =>
	rows.map((row) => row.name)

describe('an exists past its read rule', () => {
	beforeEach(async () => {
		app = defineApp({
			database: memory(),
			models: [Account, Block],
			plugins: [users.plugin()],
		})
		await app.start()
		ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
		eve = (await Account.create({ data: { name: 'Eve' } }, M)).id
		await Account.create({ data: { name: 'Bob' } }, M)
		const data = {
			fromUser: { connect: { id: ada } },
			toUser: { connect: { id: eve } },
		}
		block = (await Block.create({ data }, M)).id
	})

	afterEach(async () => {
		await app.stop()
	})

	it('reads whether a row it cannot read exists', async () => {
		expect(await read(eve)).toStrictEqual([
			{ name: 'Ada', hasBlockedMe: true },
			{ name: 'Bob', hasBlockedMe: false },
			{ name: 'Eve', hasBlockedMe: false },
		])
		for (const as of [ada, master]) {
			const rows = await read(as)
			expect(rows.map((row) => row.hasBlockedMe)).toStrictEqual([
				false,
				false,
				false,
			])
		}
	})

	it('filters on it', async () => {
		const as = asUser({ id: eve })
		const kept = await Account.findMany(
			{ where: { hasBlockedMe: false }, orderBy: { name: 'asc' } },
			{ as },
		)
		expect(names(kept)).toStrictEqual(['Bob', 'Eve'])
		const left = await Account.findMany(
			{ where: { hasBlockedMe: true } },
			{ as },
		)
		expect(names(left)).toStrictEqual(['Ada'])
	})

	it('shows the rows to no other read', async () => {
		const as = asUser({ id: eve })
		const rows = await Account.findMany(
			{
				where: { id: ada },
				select: { blocksOfMe: true, sentBlocks: true },
			},
			{ as },
		)
		expect(rows).toStrictEqual([{ blocksOfMe: [], sentBlocks: [] }])
		expect(await Block.findMany({}, { as })).toStrictEqual([])
	})

	it('keeps beforeFind', async () => {
		await Block.update({ where: { id: block }, data: { trashed: true } }, M)
		const rows = await Account.findMany(
			{ where: { hasBlockedMe: true } },
			{ as: asUser({ id: eve }) },
		)
		expect(rows).toStrictEqual([])
	})
})

/** Starts an application whose `Story.seen` is a `kind` view with readRule. */
const start = async (kind: 'one' | 'many'): Promise<void> => {
	const options = { from: 'votes', readRule: false } as const
	const Story = defineModel({
		name: 'Story',
		fields: (f) => ({
			votes: f.many(() => Vote, { inverse: 'story' }),
			// A view returns rows: the types refuse readRule, as startup does.
			seen:
				kind === 'many'
					? // @ts-expect-error -- a many view takes no readRule
						f.many(() => Vote, options)
					: // @ts-expect-error -- a one view takes no readRule
						f.one(() => Vote, options),
		}),
	})
	Reflect.apply(Reflect.get(Story, 'with'), Story, [
		{ relations: { seen: { where: () => true } } },
	])
	const Vote = defineModel({
		name: 'Vote',
		fields: (f) => ({ story: f.one(() => Story) }),
	})
	const started = defineApp({ database: memory(), models: [Story, Vote] })
	await started.start()
	await started.stop()
}

describe('the start of a view with readRule', () => {
	it('refuses it on a view that returns rows', async () => {
		await expect(start('many')).rejects.toThrow(
			"Story.seen: readRule is an exists' option; a view returns rows.",
		)
		await expect(start('one')).rejects.toThrow(
			'Story.seen is a view and takes no readRule.',
		)
	})
})

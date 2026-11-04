// A `one` view on the other row of a pair on `memory()` (D-249): a member
// reads the other member, anyone else reads none, a read fails on two other
// rows, and startup holds the view to a `many` of at most two rows.
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

const M = { as: master }
const users = definePlugin({ name: 'users', userModel: true })

// Variables, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const theirs = { viewer: false, is: undefined }
const mine = { viewer: true, isNot: undefined }

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({ name: f.string() }),
}).with({ access: allow.public })

const Chat = defineModel({
	name: 'Chat',
	fields: (f) => ({
		title: f.string(),
		members: f.many(() => Member, { inverse: 'chat', size: { max: 2 } }),
		otherMember: f.one(() => Member, { from: 'members' }),
	}),
}).with({
	access: allow.public,
	relations: {
		otherMember: { where: ({ where }) => where({ user: theirs }) },
	},
})

const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		chat: f.one(() => Chat, { onDelete: 'cascade' }),
		user: f.one(() => Account),
	}),
	indexes: [{ fields: ['chat', 'user'], unique: true }],
}).with({ access: allow.public })

const database = memory()
let app: ReturnType<typeof defineApp>
const ids = new Map<string, string>()
const id = (name: string) => ids.get(name) ?? ''

/** Each chat's title and the name of its other member, read as `as`. */
const others = async (as: unknown, where: object = {}): Promise<unknown> => {
	const rows: unknown = await query(
		'Chat',
		'findMany',
		{
			where,
			orderBy: { title: 'asc' },
			select: {
				title: true,
				otherMember: { select: { user: { select: { name: true } } } },
			},
		},
		{ as },
	)
	return rows
}

const of = (name: string) => ({ user: { name } })

describe('a one view on the other row of a pair', () => {
	beforeEach(async () => {
		app = defineApp({
			database,
			models: [Account, Chat, Member],
			plugins: [users.plugin()],
		})
		await app.start()
		for (const name of ['Ada', 'Bob', 'Eve']) {
			ids.set(name, (await Account.create({ data: { name } }, M)).id)
		}
		const chats = { Duo: ['Ada', 'Bob'], Pair: ['Bob', 'Eve'], Solo: ['Ada'] }
		for (const [title, names] of Object.entries(chats)) {
			const members = names.map((name) => ({
				user: { connect: { id: id(name) } },
			}))
			const chat = await Chat.create(
				{ data: { title, members: { create: members } } },
				M,
			)
			ids.set(title, chat.id)
		}
	})

	afterEach(async () => {
		await app.stop()
	})

	it('reads the other member for a member', async () => {
		expect(await others(asUser({ id: id('Ada') }))).toStrictEqual([
			{ title: 'Duo', otherMember: of('Bob') },
			{ title: 'Pair', otherMember: null },
			{ title: 'Solo', otherMember: null },
		])
		expect(await others(asUser({ id: id('Bob') }))).toStrictEqual([
			{ title: 'Duo', otherMember: of('Ada') },
			{ title: 'Pair', otherMember: of('Eve') },
			{ title: 'Solo', otherMember: null },
		])
	})

	it('reads none for a caller outside the pair', async () => {
		for (const as of [
			asUser({ id: 'nobody' }),
			{ kind: 'anonymous' },
			master,
		]) {
			expect(await others(as)).toStrictEqual([
				{ title: 'Duo', otherMember: null },
				{ title: 'Pair', otherMember: null },
				{ title: 'Solo', otherMember: null },
			])
		}
	})

	it('filters on the other member', async () => {
		const ada = asUser({ id: id('Ada') })
		const withBob = { otherMember: { is: { user: { is: { name: 'Bob' } } } } }
		expect(await others(ada, withBob)).toStrictEqual([
			{ title: 'Duo', otherMember: of('Bob') },
		])
		const alone = { otherMember: { is: null } }
		expect(await others(ada, alone)).toStrictEqual([
			{ title: 'Pair', otherMember: null },
			{ title: 'Solo', otherMember: null },
		])
	})

	it('fails a read that finds two other rows', async () => {
		// Written around the kernel, which holds `size` (D-242).
		await database.write({
			changes: [
				{
					kind: 'insert',
					model: 'Member',
					row: { id: 'third', chat: id('Duo'), user: id('Eve') },
				},
			],
		})
		await expect(others(asUser({ id: id('Ada') }))).rejects.toThrow(
			'Chat.otherMember keeps several rows, not one.',
		)
	})
})

type Index = {
	readonly fields: readonly ('chat' | 'user' | 'removed')[]
	readonly unique: true
	readonly where?: { readonly removed: boolean }
}

const pair: Index = { fields: ['chat', 'user'], unique: true }

/** Starts an app whose `Talk.otherMember` keeps `filter`. */
async function start(
	filter: object,
	size: object = { max: 2 },
	indexes: readonly Index[] = [pair],
): Promise<void> {
	const Talk = defineModel({
		name: 'Talk',
		fields: (f) => ({
			members: f.many(() => Seat, { inverse: 'chat', size }),
			otherMember: f.one(() => Seat, { from: 'members' }),
		}),
	}).with({
		relations: { otherMember: { where: ({ where }) => where(filter) } },
	})
	const Seat = defineModel({
		name: 'Seat',
		fields: (f) => ({
			chat: f.one(() => Talk),
			user: f.one(() => Account),
			removed: f.boolean({ default: false }),
		}),
		indexes,
	})
	const started = defineApp({
		database: memory(),
		models: [Account, Talk, Seat],
		plugins: [users.plugin()],
	})
	await started.start()
	await started.stop()
}

const at = 'Talk.otherMember reads one Seat'

describe('the start of a one view on the other row of a pair', () => {
	it('takes a many of at most two rows and a unique index on its key and user', async () => {
		await expect(start({ user: theirs })).resolves.toBeUndefined()
		await expect(
			start({ user: theirs }, { min: 1, max: 1 }),
		).resolves.toBeUndefined()
	})

	it('stops on a many that holds more than two rows', async () => {
		const message = `${at}: viewer: false reads the other row of a pair; give members size: { max: 2 }.`
		await expect(start({ user: theirs }, {})).rejects.toThrow(message)
		await expect(start({ user: theirs }, { max: 3 })).rejects.toThrow(message)
		await expect(start({ user: theirs }, { min: 1 })).rejects.toThrow(message)
	})

	it('stops without the unique index', async () => {
		const message = `${at}: give Seat a unique index on chat and user, as { fields: ['chat', 'user'], unique: true }.`
		await expect(start({ user: theirs }, { max: 2 }, [])).rejects.toThrow(
			message,
		)
		const partial = { ...pair, where: { removed: false } }
		await expect(
			start({ user: theirs }, { max: 2 }, [partial]),
		).rejects.toThrow(message)
	})

	it('stops on a filter beside viewer: false', async () => {
		const message = `${at}: viewer: false stands alone in the filter, as where({ user: { viewer: false } }).`
		for (const filter of [
			{ user: theirs, removed: false },
			{ AND: [{ user: theirs }, { removed: false }] },
			{ AND: [{ user: mine }, { user: theirs }] },
			{ OR: [{ user: theirs }] },
			{ chat: { is: { members: { some: { user: theirs } } } } },
		]) {
			await expect(start(filter)).rejects.toThrow(message)
		}
	})
})

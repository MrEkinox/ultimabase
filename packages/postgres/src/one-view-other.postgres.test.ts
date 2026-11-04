// A `one` view on the other row of a pair on postgres() (D-249): a member
// reads the other member, anyone else reads none, and a read fails on two
// other rows written around the kernel.
import { asUser, testApplication } from '@ultimabase/testing'
import type { Identity } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const anonymous: Identity = { kind: 'anonymous' }
const database = createAdapter({ url: server })
const users = definePlugin({ name: 'users', userModel: true })

// A variable, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const theirs = { viewer: false, is: undefined }

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

/** A member to create, of `user`. */
const member = (user: string) => ({ user: { connect: { id: user } } })

/** The name of the other member of `chat`, read as `as`. */
const other = async (chat: string, as: Identity) => {
	const read = await Chat.findUnique(
		{
			where: { id: chat },
			select: {
				otherMember: { select: { user: { select: { name: true } } } },
			},
		},
		{ as },
	)
	return read?.otherMember?.user?.name ?? null
}

describe('a one view on the other row of a pair on postgres()', () => {
	testApplication(
		defineApp({
			database,
			models: [Account, Chat, Member],
			plugins: [users.plugin()],
		}),
		{ database: 'declared' },
	)

	it('reads the other member for a member, and none for anyone else', async () => {
		const account = async (name: string) =>
			(await Account.create({ data: { name } }, M)).id
		const [ada, bob, eve] = [
			await account('Ada'),
			await account('Bob'),
			await account('Eve'),
		]
		const chat = await Chat.create(
			{
				data: {
					title: 'Duo',
					members: { create: [member(ada), member(bob)] },
				},
			},
			M,
		)
		await expect(other(chat.id, asUser({ id: ada }))).resolves.toBe('Bob')
		await expect(other(chat.id, asUser({ id: bob }))).resolves.toBe('Ada')
		for (const as of [asUser({ id: eve }), anonymous, master]) {
			await expect(other(chat.id, as)).resolves.toBeNull()
		}
		const found = await Chat.findMany(
			{
				where: { otherMember: { is: { user: { is: { name: 'Bob' } } } } },
				select: { title: true },
			},
			{ as: asUser({ id: ada }) },
		)
		expect(found).toStrictEqual([{ title: 'Duo' }])
		// Written around the kernel, which holds `size` (D-242).
		await database.sql`insert into member (id, created_at, updated_at, chat_id, user_id)
			values (gen_random_uuid(), now(), now(), ${chat.id}, ${eve})`
		await expect(other(chat.id, asUser({ id: ada }))).rejects.toThrow(
			'more than one row returned by a subquery',
		)
	})
})

// The ACL plugin (D-124): a default ACL, written by Master only, and rows a
// caller cannot read absent, or cannot write left out of its writes.
import { defineRole, rolesPlugin } from '@ultimabase/roles'
import { asUser } from '@ultimabase/testing'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { ACL, acl, aclPlugin } from './index.ts'

const M = { as: master }

const Role = defineRole({ name: 'Role', members: () => User })
const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), roles: f.many(() => Role) }),
})
const Folder = defineModel({
	name: 'Folder',
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
}).with({ access: allow.public })
/** A note its author reads and writes; an anonymous one is public. */
const Note = defineModel({
	name: 'Note',
	use: [
		acl({
			default: ({ caller }) =>
				caller.kind === 'user'
					? new ACL().allowUser(caller.user)
					: new ACL().allowPublic(),
		}),
	],
	fields: (f) => ({
		title: f.string(),
		folder: f.one(() => Folder, { optional: true }),
	}),
}).with({ access: allow.public })

const started = () =>
	defineApp({
		database: memory(),
		plugins: [rolesPlugin(), aclPlugin()],
		models: [Role, User, Folder, Note],
	})

/** A user caller, in `roles`. */
async function user(email: string, roles: readonly { id: string }[] = []) {
	const created = await User.create(
		{ data: { email, roles: { connect: roles.map(({ id }) => ({ id })) } } },
		M,
	)
	return { as: { kind: 'user', user: { id: created.id } } } as const
}

const anonymous = { as: { kind: 'anonymous' } } as const

/** A note Master creates with `acl`. */
const note = async (title: string, given: ACL) =>
	Note.create({ data: { title, acl: given } }, M)

describe('an acl field', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it("gets the default's ACL, read back as an ACL", async () => {
		const ada = await user('ada@example.com')
		const created = await Note.create({ data: { title: 'Q3' } }, ada)
		expectTypeOf(created.acl).toEqualTypeOf<ACL>()
		expect(created.acl).toBeInstanceOf(ACL)
		expect(created.acl.allows(ada.as, 'write')).toBe(true)
		const open = await Note.create({ data: { title: 'open' } }, anonymous)
		expect(open.acl.toJSON()).toEqual({ read: ['*'], write: ['*'] })
	})

	it('is written by Master only, as an ACL or its JSON', async () => {
		const ada = await user('ada@example.com')
		const shared = new ACL().allowPublic('read')
		await expect(
			Note.create({ data: { title: 'a', acl: shared } }, ada),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		const created = await Note.create({ data: { title: 'b' } }, ada)
		await expect(
			Note.update({ where: { id: created.id }, data: { acl: shared } }, ada),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		const json = { read: ['*'], write: ['user:u_1'] }
		const updated = await Note.update(
			{ where: { id: created.id }, data: { acl: json } },
			M,
		)
		expect(updated.acl.toJSON()).toEqual(json)
		await expect(
			Note.update(
				{
					where: { id: created.id },
					data: { acl: { read: ['team:1'], write: [] } },
				},
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['acl'],
						message: 'read[0]: a subject is *, user:<id> or role:<id>.',
					},
				],
			},
		})
	})
})

describe('the ACL plugin', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('hides the rows a caller cannot read, at every level', async () => {
		const ada = await user('ada@example.com')
		const bob = await user('bob@example.com')
		const folder = await Folder.create({ data: { name: 'Work' } }, M)
		const mine = await Note.create(
			{ data: { title: 'mine', folder: { connect: { id: folder.id } } } },
			ada,
		)
		const titles = async (as: { readonly as: typeof ada.as }) =>
			(await Note.findMany({}, as)).map(({ title }) => title)
		expect(await titles(ada)).toEqual(['mine'])
		expect(await titles(bob)).toEqual([])
		expect(await Note.findMany({}, anonymous)).toEqual([])
		expect(await Note.count({}, M)).toBe(1)
		const seen = await Folder.findUnique(
			{ where: { id: folder.id }, include: { notes: true } },
			bob,
		)
		expect(seen?.notes).toEqual([])
		expect(await Note.findUnique({ where: { id: mine.id } }, bob)).toBeNull()
	})

	it('gives the public its rights, and an anonymous caller only those', async () => {
		const ada = await user('ada@example.com')
		await note('public', new ACL().allowPublic('read'))
		await note('ada', new ACL().allowUser(ada.as.user, 'read'))
		expect(
			(await Note.findMany({}, anonymous)).map(({ title }) => title),
		).toEqual(['public'])
		expect(
			(await Note.findMany({ orderBy: { title: 'asc' } }, ada)).map(
				({ title }) => title,
			),
		).toEqual(['ada', 'public'])
	})

	it('leaves out of a write the rows a caller reads but cannot write', async () => {
		const ada = await user('ada@example.com')
		const { id } = ada.as.user
		const read = await note('read', new ACL().allowUser({ id }, 'read'))
		const blind = await note('blind', new ACL().allowUser({ id }, 'write'))
		const mine = await note('mine', new ACL().allowUser({ id }))
		for (const { id: target } of [read, blind]) {
			await expect(
				Note.update({ where: { id: target }, data: { title: 'x' } }, ada),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(
				Note.delete({ where: { id: target } }, ada),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		}
		const updated = await Note.update(
			{ where: { id: mine.id }, data: { title: 'edited' } },
			ada,
		)
		expect(updated.title).toBe('edited')
		expect(await Note.deleteMany({}, ada)).toEqual({ count: 1 })
		expect(await Note.count({}, M)).toBe(2)
	})

	it('needs the write right to connect a row from the other side', async () => {
		const ada = await user('ada@example.com')
		const { id } = ada.as.user
		const folder = await Folder.create({ data: { name: 'Work' } }, M)
		const read = await note('read', new ACL().allowUser({ id }, 'read'))
		const connect = (target: string) =>
			Folder.update(
				{
					where: { id: folder.id },
					data: { notes: { connect: [{ id: target }] } },
				},
				ada,
			)
		await expect(connect(read.id)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Note does not exist.',
		})
		const mine = await note('mine', new ACL().allowUser({ id }))
		await connect(mine.id)
		const moved = await Note.findUnique(
			{ where: { id: mine.id }, include: { folder: true } },
			M,
		)
		expect(moved?.folder?.id).toBe(folder.id)
	})

	it("gives a role's rights to its members, inherited ones included", async () => {
		const editor = await Role.create({ data: { name: 'Editor' } }, M)
		const admin = await Role.create(
			{ data: { name: 'Admin', inherits: { connect: [{ id: editor.id }] } } },
			M,
		)
		const ada = await user('ada@example.com', [admin])
		const bob = await user('bob@example.com')
		const shared = await note('shared', new ACL().allowRole(editor))
		expect(await Note.findMany({}, ada)).toHaveLength(1)
		const updated = await Note.update(
			{ where: { id: shared.id }, data: { title: 'edited' } },
			ada,
		)
		expect(updated.title).toBe('edited')
		expect(await Note.findMany({}, bob)).toEqual([])
	})
})

describe('acl()', () => {
	it('takes a default, by its types and when its model is defined', () => {
		expect(() =>
			defineModel({
				name: 'Bad',
				// @ts-expect-error: default is required.
				use: [acl({})],
				fields: (f) => ({ title: f.string() }),
			}),
		).toThrow('acl() takes default: the ACL of a row created without one.')
	})

	it('works without the roles plugin, for the public and users', async () => {
		const Doc = defineModel({
			name: 'Doc',
			use: [acl({ default: () => new ACL().allowPublic('read') })],
			fields: (f) => ({ title: f.string() }),
		}).with({ access: allow.public })
		const app = defineApp({
			database: memory(),
			plugins: [aclPlugin()],
			models: [Doc],
		})
		await app.start()
		try {
			await Doc.create({ data: { title: 'a' } }, M)
			const docs = await Doc.findMany({}, { as: asUser({ id: 'u_1' }) })
			expect(docs.map(({ title }) => title)).toEqual(['a'])
		} finally {
			await app.stop()
		}
	})
})

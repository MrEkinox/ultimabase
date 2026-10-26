// The ACL plugin on PostgreSQL (D-124): the `acl` column, its GIN index, and
// the rows a caller reads or writes through its user and its roles.
import { asUser } from '@ultimabase/testing'
import { Client } from 'pg'
import { rolesPlugin } from '@ultimabase/roles'
import { allow, defineApp, defineModel, master } from 'ultimabase'
import { expect, it } from 'vitest'
import { ACL, acl, aclPlugin } from './index.ts'
import { Role, User } from './test/declarations.ts'
import { database, urls } from './test/postgres.ts'

const M = { as: master }

const Note = defineModel({
	name: 'Note',
	use: [acl({ default: () => new ACL() })],
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })

/** The `acl` GIN indexes of the `note` tables the server has. */
async function indexes(url: string): Promise<number> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		const { rows } = await client.query<{ count: string }>(
			`select count(*) from pg_indexes where tablename = 'note' and indexdef like '%USING gin (acl)'`,
		)
		return Number(rows[0]?.count)
	} finally {
		await client.end()
	}
}

for (const url of urls) {
	it(`filters the rows by their ACL on ${new URL(url).host}`, async () => {
		const app = defineApp({
			database: database(url),
			plugins: [rolesPlugin(), aclPlugin()],
			models: [Role, User, Note],
		})
		await app.start()
		try {
			expect(await indexes(url)).toBeGreaterThanOrEqual(1)
			const editor = await Role.create({ data: { name: 'Editor' } }, M)
			const admin = await Role.create(
				{ data: { name: 'Admin', inherits: { connect: [{ id: editor.id }] } } },
				M,
			)
			const created = await User.create(
				{
					data: {
						email: 'ada@example.com',
						roles: { connect: [{ id: admin.id }] },
					},
				},
				M,
			)
			const ada = { as: asUser(created) }
			const note = (title: string, given: ACL) =>
				Note.create({ data: { title, acl: given } }, M)
			await note('public', new ACL().allowPublic('read'))
			await note('editors', new ACL().allowRole(editor))
			await note('mine', new ACL().allowUser(created, 'read'))
			await note('hidden', new ACL())
			const titles = (
				await Note.findMany({ orderBy: { title: 'asc' } }, ada)
			).map(({ title }) => title)
			expect(titles).toEqual(['editors', 'mine', 'public'])
			const read = await Note.findMany({ where: { title: 'editors' } }, ada)
			expect(read[0]?.acl).toBeInstanceOf(ACL)
			expect(read[0]?.acl.roles('write')).toEqual([editor.id])
			expect(
				await Note.findMany({}, { as: { kind: 'anonymous' } }),
			).toHaveLength(1)
			expect(await Note.deleteMany({}, ada)).toEqual({ count: 1 })
			const kept = await Note.findMany({ orderBy: { title: 'asc' } }, M)
			expect(kept.map(({ title }) => title)).toEqual([
				'hidden',
				'mine',
				'public',
			])
		} finally {
			await app.stop()
		}
	})
}

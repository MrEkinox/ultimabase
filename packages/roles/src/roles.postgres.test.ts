// Roles on PostgreSQL (D-123): the self relation's join table, read one
// level at a time until a level adds none, a cycle included.
import { asUser } from '@ultimabase/testing'
import type { Caller } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { expect, it } from 'vitest'
import { rolesOf, rolesPlugin } from './index.ts'
import { Role, User } from './test/declarations.ts'
import { database, urls } from './test/postgres.ts'

const M = { as: master }

/** Each caller a read rule received. */
const seen: Caller[] = []
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string() }),
}).with({
	access: ({ caller }) => {
		seen.push(caller)
		return true
	},
})

const role = async (name: string, inherits: readonly { id: string }[] = []) =>
	Role.create(
		{
			data: { name, inherits: { connect: inherits.map(({ id }) => ({ id })) } },
		},
		M,
	)

for (const url of urls) {
	it(`gives a caller its inherited roles on ${new URL(url).host}`, async () => {
		const app = defineApp({
			database: database(url),
			plugins: [rolesPlugin()],
			models: [Role, User, Note],
		})
		await app.start()
		try {
			const editor = await role('Editor')
			const moderator = await role('Moderator', [editor])
			const admin = await role('Admin', [moderator])
			await Role.update(
				{
					where: { id: editor.id },
					data: { inherits: { connect: [{ id: admin.id }] } },
				},
				M,
			)
			await role('Guest')
			const ada = await User.create(
				{
					data: {
						email: 'ada@example.com',
						roles: { connect: [{ id: moderator.id }] },
					},
				},
				M,
			)
			seen.length = 0
			await Note.findMany({}, { as: asUser(ada) })
			const names = rolesOf(seen[0] ?? master).map(({ name }) => name)
			expect(names.toSorted()).toEqual(['Admin', 'Editor', 'Moderator'])
		} finally {
			await app.stop()
		}
	})
}

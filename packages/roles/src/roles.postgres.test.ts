// Roles on PostgreSQL (D-123): the self relation's join table, five levels
// of inheritance read in one statement, a cycle included.
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

/** A user in the first of `count` roles, each inheriting the next. */
async function chain(count: number): Promise<{ readonly id: string }> {
	let parent = await role(`${count} 1`)
	for (let level = 2; level <= count; level += 1) {
		parent = await role(`${count} ${level}`, [parent])
	}
	return User.create(
		{
			data: {
				email: `${count}@example.com`,
				roles: { connect: [{ id: parent.id }] },
			},
		},
		M,
	)
}

for (const url of urls) {
	it(`gives a caller its inherited roles on ${new URL(url).host}`, async () => {
		let statements = 0
		const app = defineApp({
			database: database(url, () => {
				statements += 1
			}),
			plugins: [rolesPlugin()],
			models: [Role, User, Note],
		})
		await app.start()
		/** The caller's role names, and the statements its read ran. */
		const read = async (user: { readonly id: string }) => {
			seen.length = 0
			statements = 0
			await Note.findMany({}, { as: asUser(user) })
			const names = rolesOf(seen[0] ?? master).map(({ name }) => name)
			return { names: names.toSorted(), statements }
		}
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
			// One statement for the roles, one for the notes.
			expect(await read(ada)).toEqual({
				names: ['Admin', 'Editor', 'Moderator'],
				statements: 2,
			})
			// A role and five levels of inheritance, then one more.
			expect((await read(await chain(6))).statements).toBe(2)
			const deeper = await read(await chain(7))
			expect(deeper.names).toHaveLength(7)
			expect(deeper.statements).toBe(3)
		} finally {
			await app.stop()
		}
	})
}

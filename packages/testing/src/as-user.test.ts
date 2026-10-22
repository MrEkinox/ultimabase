// `asUser` (D-80): a test acts as a user, so the access rules apply.
import { defineApp, defineModel, master, memory } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from './index.ts'
import { silent } from './silent.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), owner: f.string() }),
}).with({
	access: {
		read: ({ caller }) => caller.kind === 'user',
		update: ({ caller, record }) =>
			caller.kind === 'user' && caller.user.id === record.owner,
	},
})

describe('asUser', () => {
	const app = defineApp({ database: memory(), models: [Note], logger: silent })
	beforeEach(async () => app.start())
	afterEach(async () => app.stop())

	it('builds a frozen user caller', () => {
		const caller = asUser({ id: 'ada' })
		expect(caller).toEqual({ kind: 'user', user: { id: 'ada' } })
		expect(Object.isFrozen(caller)).toBe(true)
	})

	it('acts as that user, under the access rules', async () => {
		const note = await Note.create(
			{ data: { text: 't', owner: 'ada' } },
			{ as: master },
		)
		const where = { id: note.id }
		const data = { text: 'u' }
		await expect(
			Note.update({ where, data }, { as: asUser({ id: 'bob' }) }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await expect(
			Note.update({ where, data }, { as: asUser({ id: 'ada' }) }),
		).resolves.toMatchObject({ text: 'u' })
	})
})

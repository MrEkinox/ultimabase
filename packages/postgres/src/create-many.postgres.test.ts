// `createMany` on postgres(): its rows' connects are checked in one count per
// target, which keeps thousands of rows within the 1664 columns a statement
// selects.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		likes: f.many(() => Like, { inverse: 'from' }),
		liked: f.many(() => Like, { inverse: 'to' }),
	}),
})

const Like = defineModel({
	name: 'Like',
	fields: (f) => ({ from: f.one(() => User), to: f.one(() => User) }),
})

describe('createMany on postgres()', () => {
	testApplication(
		defineApp({
			database: createAdapter({ url: server }),
			models: [User, Like],
		}),
		{ database: 'declared' },
	)

	it('connects 2,000 rows to their users in one write', async () => {
		const names = Array.from({ length: 2000 }, (_, at) => ({ name: `u${at}` }))
		const users = await User.createManyAndReturn({ data: names }, M)
		// A count per row failed from 1,665 rows: "target lists can have at
		// most 1664 entries".
		const data = users.map((user, at) => ({
			from: { connect: { id: user.id } },
			to: { connect: { id: users[(at + 1) % users.length]?.id ?? '' } },
		}))
		expect(await Like.createMany({ data }, M)).toEqual({ count: 2000 })
		const [first] = users
		expect(
			await Like.count({ where: { to: { is: { id: first?.id ?? '' } } } }, M),
		).toBe(1)
	})
})

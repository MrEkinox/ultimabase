// A virtual that needs a stored `one` on postgres() (D-184): the key is read
// with the row's columns, and read again only for the rows whose included
// relation the caller cannot read.
import { testApplication } from '@ultimabase/testing'
import { allow, defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		author: f.one(() => Member),
		byAda: f.virtual(z.boolean(), { needs: ['author'] }),
	}),
}).with({
	access: allow.public,
	virtuals: {
		byAda: { run: ({ record }) => record.author.id === ada },
	},
})

const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		name: f.string(),
		hidden: f.boolean({ default: false }),
		comments: f.many(() => Comment),
	}),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

let ada = ''

describe('a virtual that needs a relation on postgres()', () => {
	const running = testApplication(
		defineApp({
			database: createAdapter({ url: server }),
			models: [Comment, Member],
		}),
		{ database: 'declared' },
	)

	it('gets its key with the rows, in one query', async () => {
		ada = (await Member.create({ data: { name: 'Ada' } }, M)).id
		const grace = await Member.create(
			{ data: { name: 'Grace', hidden: true } },
			M,
		)
		for (const author of [ada, grace.id]) {
			await Comment.create(
				{ data: { body: author, author: { connect: { id: author } } } },
				M,
			)
		}
		const page = { orderBy: { body: 'asc' }, select: { byAda: true } } as const
		let found: unknown
		expect(
			await running.queries(async () => {
				found = await Comment.findMany(page, {})
			}),
		).toStrictEqual(['find Comment'])
		const ids = [ada, grace.id].toSorted()
		expect(found).toStrictEqual(ids.map((id) => ({ byAda: id === ada })))
		// Grace is no row to the caller: her comment's key is read again.
		const included = {
			...page,
			select: { byAda: true, author: { select: { name: true } } },
		}
		expect(
			await running.queries(async () => {
				found = await Comment.findMany(included, {})
			}),
		).toStrictEqual(['find Comment', 'find Comment'])
		const shown = { name: 'Ada' }
		expect(found).toStrictEqual(
			ids.map((id) => ({
				byAda: id === ada,
				author: id === ada ? shown : null,
			})),
		)
	})
})

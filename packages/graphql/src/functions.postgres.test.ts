// Functions over GraphQL on PostgreSQL (D-109): relations re-read by id as
// the caller, and a date read as the client sent it.
import { allow, defineFunction } from 'ultimabase'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { M, Post, post, seeded, started } from './test/app.ts'
import { database, urls } from './test/postgres.ts'

const recent = defineFunction({
	name: 'recent',
	query: true,
	output: [Post],
	run: async () => Post.findMany({ orderBy: { title: 'asc' } }, M),
}).with({ access: allow.public })

const since = defineFunction({
	name: 'since',
	query: true,
	input: z.object({ at: z.iso.datetime({ offset: true }) }),
	output: [Post],
	run: async ({ input }) =>
		Post.findMany(
			{
				where: { publishedAt: { gte: new Date(input.at) } },
				orderBy: { title: 'asc' },
			},
			M,
		),
}).with({ access: allow.public })

for (const url of urls) {
	it(`runs functions and re-reads their relations on ${new URL(url).host}`, async () => {
		const running = await started({}, database(url), [], [recent, since])
		try {
			await seeded()
			const read = await post(
				`${running.url}/graphql`,
				'{ recent { title author { name email } } since(at: "2026-01-03T02:00:00+02:00") { title author { name } } }',
			)
			expect(read).toStrictEqual({
				data: {
					recent: [
						// The caller does not read emails.
						{ title: 'four', author: { name: 'bob', email: null } },
						{ title: 'one', author: { name: 'ada', email: null } },
						{ title: 'three', author: { name: 'ada', email: null } },
						{ title: 'two', author: { name: 'ada', email: null } },
					],
					since: [
						{ title: 'four', author: { name: 'bob' } },
						{ title: 'three', author: { name: 'ada' } },
					],
				},
			})
		} finally {
			await running.app.stop()
		}
	})
}

// A whole CRUD over REST on PostgreSQL (D-129): each server
// `TEST_DATABASE_URL` lists, each run in its own schema (D-98).
import { expect, it } from 'vitest'
import { database, urls } from './test/postgres.ts'
import { asMaster, at, call, qs, started } from './test/app.ts'

for (const url of urls) {
	it(`creates, reads, updates and deletes on ${new URL(url).host}`, async () => {
		const running = await started({}, database(url))
		const ask = (method: string, path: string, body?: unknown) =>
			call(running.url, method, path, {
				headers: asMaster,
				...(body === undefined ? {} : { body }),
			})
		try {
			const user = await ask(
				'POST',
				`/api/users${qs({ select: { name: true } })}`,
				{
					name: 'ada',
					email: 'ada@example.com',
				},
			)
			expect(user).toStrictEqual({ status: 201, body: { name: 'ada' } })
			const read = await ask('GET', `/api/users${qs({ select: { id: true } })}`)
			const ada = String(at(read.body, 'edges', 0, 'node', 'id'))
			const created = await ask(
				'POST',
				`/api/posts${qs({
					select: {
						id: true,
						title: true,
						meta: true,
						publishedAt: true,
						author: { select: { name: true } },
					},
				})}`,
				{
					title: 'Hello',
					slug: 'hello',
					status: 'draft',
					meta: { tags: ['intro'] },
					publishedAt: '2026-01-31T12:00:00.000Z',
					author: { connect: { id: ada } },
				},
			)
			const id = String(at(created.body, 'id'))
			expect(created).toStrictEqual({
				status: 201,
				body: {
					id,
					title: 'Hello',
					meta: { tags: ['intro'] },
					publishedAt: '2026-01-31T12:00:00.000Z',
					author: { name: 'ada' },
				},
			})
			const updated = await ask(
				'PATCH',
				`/api/posts/${id}${qs({ select: { status: true, views: true } })}`,
				{ status: 'published', views: 3 },
			)
			expect(updated).toStrictEqual({
				status: 200,
				body: { status: 'published', views: 3 },
			})
			const listed = await ask(
				'GET',
				`/api/posts${qs({
					where: { publishedAt: { lt: '2026-02-01T00:00:00.000Z' } },
					select: { title: true },
					totalCount: true,
				})}`,
			)
			expect(at(listed.body, 'edges', 0, 'node')).toStrictEqual({
				title: 'Hello',
			})
			expect(at(listed.body, 'pageInfo', 'hasNextPage')).toBe(false)
			expect(at(listed.body, 'totalCount')).toBe(1)
			const deleted = await ask('DELETE', `/api/posts/${id}`)
			expect(deleted.status).toBe(200)
			expect(at(deleted.body, 'title')).toBe('Hello')
			expect((await ask('GET', `/api/posts/${id}`)).status).toBe(404)
		} finally {
			await running.app.stop()
		}
	})
}

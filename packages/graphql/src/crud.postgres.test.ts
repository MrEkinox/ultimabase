// A whole CRUD over GraphQL on PostgreSQL (D-107): each server
// `TEST_DATABASE_URL` lists, each run in its own schema (D-98).
import { randomUUID } from 'node:crypto'
import { postgres } from '@ultimabase/postgres'
import { Client } from 'pg'
import type { Adapter } from 'ultimabase'
import { expect, it } from 'vitest'
import { asMaster, at, post, started } from './test/app.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

/** `postgres()` in a schema of its own, dropped when it stops. */
function database(url: string): Adapter {
	const schema = `t_${randomUUID().replaceAll('-', '')}`
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const adapter = postgres({ url: `${url}?options=${options}` })
	return {
		...adapter,
		start: async (given) => {
			await run(url, `create schema "${schema}"`)
			await adapter.start(given)
		},
		stop: async () => {
			await adapter.stop()
			await run(url, `drop schema "${schema}" cascade`)
		},
	}
}

for (const url of urls) {
	it(`creates, reads, updates and deletes on ${new URL(url).host}`, async () => {
		const running = await started({}, database(url))
		const ask = (query: string, variables?: object) =>
			post(`${running.url}/graphql`, query, variables, asMaster)
		try {
			const user = await ask(
				`mutation { createUser(data: { name: "ada", email: "ada@example.com" }) { id name } }`,
			)
			const ada = at(user.data, 'createUser', 'id')
			expect(user).toStrictEqual({
				data: { createUser: { id: ada, name: 'ada' } },
			})
			const created = await ask(
				`mutation ($ada: ID!) { createPost(data: {
					title: "Hello", slug: "hello", status: draft, views: 0,
					meta: { tags: ["intro"] }, publishedAt: "2026-01-31T12:00:00.000Z",
					author: { connect: { id: $ada } }
				}) { title status meta publishedAt author { name } } }`,
				{ ada },
			)
			expect(created).toStrictEqual({
				data: {
					createPost: {
						title: 'Hello',
						status: 'draft',
						meta: { tags: ['intro'] },
						publishedAt: '2026-01-31T12:00:00.000Z',
						author: { name: 'ada' },
					},
				},
			})
			const updated = await ask(
				`mutation ($ada: ID!) { updatePost(
					where: { author_slug: { author: $ada, slug: "hello" } },
					data: { status: published, views: 3 }
				) { status views } }`,
				{ ada },
			)
			expect(updated).toStrictEqual({
				data: { updatePost: { status: 'published', views: 3 } },
			})
			const read = await ask(
				`{ user(where: { name: "ada" }) { email posts(first: 5) {
					edges { node { title status } } pageInfo { hasNextPage }
				} } posts(where: { status: { equals: published } }) { totalCount } }`,
			)
			expect(read).toStrictEqual({
				data: {
					user: {
						email: 'ada@example.com',
						posts: {
							edges: [{ node: { title: 'Hello', status: 'published' } }],
							pageInfo: { hasNextPage: false },
						},
					},
					posts: { totalCount: 1 },
				},
			})
			const deleted = await ask(
				`mutation ($ada: ID!) { deletePost(
					where: { author_slug: { author: $ada, slug: "hello" } }
				) { title views } }`,
				{ ada },
			)
			expect(deleted).toStrictEqual({
				data: { deletePost: { title: 'Hello', views: 3 } },
			})
			const left = await ask(`{ posts { totalCount } }`)
			expect(left).toStrictEqual({ data: { posts: { totalCount: 0 } } })
		} finally {
			await running.app.stop()
		}
	})
}

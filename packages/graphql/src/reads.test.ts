// Reads over GraphQL (D-107): the generated types, filters, the `@oneOf`
// unique target, connections both ways, read rules, limits and errors.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Result } from './test/app.ts'
import { asMaster, at, post, seeded, started } from './test/app.ts'

let running: Awaited<ReturnType<typeof started>>
let ada = ''
let bob = ''
beforeAll(async () => {
	running = await started()
	;({ ada, bob } = await seeded())
})
afterAll(async () => running.app.stop())

const ask = (
	query: string,
	variables?: object,
	headers?: Record<string, string>,
): Promise<Result> => post(`${running.url}/graphql`, query, variables, headers)

describe('a one-row read', () => {
	it('finds a row by id, a unique field or a unique index', async () => {
		const byName = await ask(`{ user(where: { name: "ada" }) { id name } }`)
		expect(byName).toStrictEqual({ data: { user: { id: ada, name: 'ada' } } })
		const byIndex = await ask(
			`query ($author: ID!) {
				post(where: { author_slug: { author: $author, slug: "two" } }) {
					title author { name }
				}
			}`,
			{ author: ada },
		)
		expect(byIndex).toStrictEqual({
			data: { post: { title: 'two', author: { name: 'ada' } } },
		})
		const none = await ask(`{ user(where: { id: "nobody" }) { id } }`)
		expect(none).toStrictEqual({ data: { user: null } })
	})

	it('takes exactly one unique target', async () => {
		const both = await ask(`{ user(where: { name: "ada", id: "x" }) { id } }`)
		expect(both.errors?.[0]?.message).toContain('exactly one')
	})

	it('returns each scalar type as GraphQL spells it', async () => {
		const result = await ask(
			`{ post(where: { author_slug: { author: "${ada}", slug: "three" } }) {
				status views meta publishedAt createdAt
			} }`,
		)
		expect(result.data).toMatchObject({
			post: {
				status: 'published',
				views: 20,
				meta: { index: 2 },
				publishedAt: '2026-01-03T00:00:00.000Z',
			},
		})
	})
})

describe('read rules', () => {
	it('leave out a private field and null a ruled one', async () => {
		const ruled = await ask(`{ user(where: { name: "ada" }) { email } }`)
		expect(ruled).toStrictEqual({ data: { user: { email: null } } })
		const master = await ask(
			`{ user(where: { name: "ada" }) { email } }`,
			undefined,
			asMaster,
		)
		expect(master).toStrictEqual({
			data: { user: { email: 'ada@example.com' } },
		})
		const absent = await ask(`{ user(where: { name: "ada" }) { password } }`)
		expect(absent.errors?.[0]?.message).toContain('password')
	})

	it('refuse a filter on a ruled field as a client error', async () => {
		const result = await ask(
			`{ users(where: { email: { equals: "x" } }) { totalCount } }`,
		)
		expect(result.data).toBeNull()
		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'BAD_USER_INPUT',
		})
	})
})

const titles = (result: Result): unknown => {
	const edges = at(result.data, 'posts', 'edges')
	return Array.isArray(edges)
		? edges.map((edge: unknown) => at(edge, 'node', 'title'))
		: edges
}

describe('a list', () => {
	it('filters, sorts and counts', async () => {
		const result = await ask(
			`{ posts(where: { status: { equals: published }, views: { gte: 0 } },
				orderBy: [{ views: desc }]) {
				totalCount edges { node { title } }
			} }`,
		)
		expect(titles(result)).toStrictEqual(['three', 'one'])
		expect(at(result.data, 'posts', 'totalCount')).toBe(2)
		const text = await ask(
			`{ posts(where: { title: { startsWith: "t" }, OR: [{ views: { lt: 15 } }] }) {
				edges { node { title } }
			} }`,
		)
		expect(titles(text)).toStrictEqual(['two'])
		// A json field has no order (D-94).
		const json = await ask(`{ posts(orderBy: [{ meta: asc }]) { totalCount } }`)
		expect(json.errors?.[0]?.message).toContain('unknown field "meta"')
	})

	it('pages forward and backward with cursors', async () => {
		const first = await ask(
			`{ posts(first: 2, orderBy: [{ views: asc }]) {
				edges { cursor node { title } }
				pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
			} }`,
		)
		expect(titles(first)).toStrictEqual(['one', 'two'])
		const page = at(first.data, 'posts', 'pageInfo')
		expect(page).toMatchObject({ hasNextPage: true, hasPreviousPage: false })
		const next = await ask(
			`query ($after: String) { posts(first: 2, after: $after, orderBy: [{ views: asc }]) {
				edges { cursor node { title } } pageInfo { hasNextPage }
			} }`,
			{ after: at(page, 'endCursor') },
		)
		expect(titles(next)).toStrictEqual(['three', 'four'])
		expect(at(next.data, 'posts', 'pageInfo', 'hasNextPage')).toBe(false)
		const back = await ask(
			`query ($before: String) { posts(last: 1, before: $before, orderBy: [{ views: asc }]) {
				edges { node { title } } pageInfo { hasPreviousPage }
			} }`,
			{ before: at(next.data, 'posts', 'edges', 0, 'cursor') },
		)
		expect(titles(back)).toStrictEqual(['two'])
		expect(at(back.data, 'posts', 'pageInfo', 'hasPreviousPage')).toBe(true)
		const last = await ask(
			`{ posts(last: 2, orderBy: [{ views: asc }]) { edges { node { title } } } }`,
		)
		expect(titles(last)).toStrictEqual(['three', 'four'])
	})

	it('refuses a cursor it did not return and mixed directions', async () => {
		const forged = await ask(`{ posts(after: "???") { totalCount } }`)
		expect(forged.errors?.[0]?.message).toBe(
			'after is not a cursor this API returned.',
		)
		const mixed = await ask(`{ posts(first: 1, last: 1) { totalCount } }`)
		expect(mixed.errors?.[0]?.extensions).toStrictEqual({
			code: 'BAD_USER_INPUT',
		})
	})

	it('reads a relation as its own connection, in the same query', async () => {
		const result = await ask(
			`{ user(where: { name: "ada" }) {
				name
				posts(first: 1, orderBy: [{ views: desc }]) {
					edges { node { title author { name } } }
					pageInfo { hasNextPage }
				}
				...on User { recent: posts(first: 1, orderBy: [{ views: desc }]) { pageInfo { hasNextPage } } }
			} }`,
		)
		expect(result).toStrictEqual({
			data: {
				user: {
					name: 'ada',
					posts: {
						edges: [{ node: { title: 'three', author: { name: 'ada' } } }],
						pageInfo: { hasNextPage: true },
					},
					recent: { pageInfo: { hasNextPage: true } },
				},
			},
		})
		const twice = await ask(
			`{ user(where: { name: "ada" }) {
				a: posts(first: 1) { totalCount: pageInfo { hasNextPage } }
				b: posts(first: 2) { pageInfo { hasNextPage } }
			} }`,
		)
		expect(twice.errors?.[0]?.message).toBe(
			'posts is selected twice with different arguments; read it once.',
		)
	})

	it('honors @skip, @include and named fragments', async () => {
		const result = await ask(
			`query ($skip: Boolean!) { user(where: { name: "bob" }) { ...Fields } }
			fragment Fields on User { name @skip(if: $skip) posts @include(if: true) { edges { node { title } } } }`,
			{ skip: true },
		)
		expect(result).toStrictEqual({
			data: { user: { posts: { edges: [{ node: { title: 'four' } }] } } },
		})
	})

	it('keeps within the limits unless Master asks', async () => {
		const over = await ask(`{ users(first: 4) { totalCount } }`)
		expect(over.errors?.[0]?.message).toBe('first is at most 3 on User.')
		const negative = await ask(`{ posts(first: -1) { totalCount } }`)
		expect(negative.errors?.[0]?.message).toBe('first cannot be negative.')
		const master = await ask(
			`{ users(first: 4) { edges { node { name } } } }`,
			undefined,
			asMaster,
		)
		expect(master.errors).toBeUndefined()
		const backward = await ask(
			`{ posts(before: "${Buffer.from(bob).toString('base64url')}") { totalCount } }`,
			undefined,
			asMaster,
		)
		expect(backward.errors).toBeUndefined()
	})
})

describe('scalar filters', () => {
	it('read a DateTime and a JSON value, by variable or literal', async () => {
		const dates = await ask(
			`query ($from: DateTime) { posts(where: {
				publishedAt: { gte: $from, lt: "2026-01-04T00:00:00.000Z" }
			}) { edges { node { title } } } }`,
			{ from: '2026-01-02T00:00:00.000Z' },
		)
		expect(titles(dates)).toStrictEqual(['two', 'three'])
		const json = await ask(
			`{ posts(where: { meta: { in: [{ index: 1 }, { index: 3 }] } }) {
				edges { node { title } }
			} }`,
		)
		expect(titles(json)).toStrictEqual(['two', 'four'])
		const invalid = await ask(
			`{ posts(where: { publishedAt: { gte: "yesterday" } }) { totalCount } }`,
		)
		expect(invalid.errors?.[0]?.message).toContain('ISO 8601')
	})
})

describe('the transport', () => {
	it('answers a GET with the type names asked for', async () => {
		const query = encodeURIComponent(
			'{ __typename user(where: { name: "bob" }) { __typename name } }',
		)
		const response = await fetch(`${running.url}/graphql?query=${query}`)
		expect(await response.json()).toStrictEqual({
			data: { __typename: 'Query', user: { __typename: 'User', name: 'bob' } },
		})
	})

	it('explains a request it cannot read', async () => {
		const response = await fetch(`${running.url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		})
		expect(response.status).toBe(400)
		expect(await response.json()).toStrictEqual({
			errors: [{ message: 'Missing query' }],
		})
	})
})

describe('errors', () => {
	it('mask an unexpected error and log it with its id', async () => {
		const result = await ask(`{ secrets { totalCount } }`)
		const [error] = result.errors ?? []
		expect(error?.message).toBe('Internal error.')
		const correlationId = at(error?.extensions, 'correlationId')
		expect(error?.extensions).toStrictEqual({ code: 'INTERNAL', correlationId })
		expect(running.lines).toContainEqual({
			level: 'error',
			first: { correlationId, err: new Error('The rule broke.') },
		})
	})
})

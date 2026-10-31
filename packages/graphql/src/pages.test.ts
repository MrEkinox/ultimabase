// A function's page over GraphQL (D-182): the model's connection or list,
// paged and bounded as the generated list, at the root or in a type, its
// count read when selected, once.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Adapter } from 'ultimabase'
import { allow, defineFunction, defineType, memory } from 'ultimabase'
import { graphql } from './index.ts'
import type { GraphqlOptions } from './index.ts'
import { at, M, Post, post, seeded, started, User } from './test/app.ts'

const posts = defineFunction({
	name: 'posts',
	query: true,
	use: [graphql()],
	input: z.object({ status: z.enum(['draft', 'published']) }),
	output: Post.paginated(),
	run: ({ input, caller }) =>
		Post.paginate(
			{ where: { status: input.status }, orderBy: { title: 'asc' } },
			{ as: caller },
		),
}).with({ access: allow.public, graphql: { name: 'paged' } })

const people = defineFunction({
	name: 'people',
	query: true,
	output: User.paginated(),
	run: () => User.paginate({ orderBy: { name: 'asc' } }, M),
}).with({ access: allow.public })

const Profile = defineType({
	name: 'Profile',
	fields: { user: User, posts: Post.paginated() },
})
const profile = defineFunction({
	name: 'profile',
	query: true,
	input: z.object({ name: z.string() }),
	output: defineType({
		name: 'Wrapper',
		fields: { profile: Profile.nullable() },
	}),
	run: async ({ input }) => {
		const user = await User.findUnique({ where: { name: input.name } }, M)
		if (user === null) return { profile: null }
		const where = { author: { is: { id: user.id } } }
		const page = Post.paginate({ where, orderBy: { title: 'desc' } }, M)
		return { profile: { user, posts: page } }
	},
}).with({ access: allow.public })

const wrong = defineFunction({
	name: 'wrong',
	query: true,
	output: Post.paginated(),
	// @ts-expect-error: a page of Post is Post.paginate's.
	run: () => User.paginate({}, M),
}).with({ access: allow.public })

const functions = [posts, people, profile, wrong]

async function serving(
	options: GraphqlOptions,
	test: (url: string) => Promise<void>,
	database: Adapter = memory(),
): Promise<void> {
	const running = await started(options, database, [], functions)
	try {
		await seeded()
		await test(`${running.url}/graphql`)
	} finally {
		await running.app.stop()
	}
}

function titles(connection: unknown): unknown {
	const edges = at(connection, 'edges')
	return Array.isArray(edges)
		? edges.map((edge: unknown) => at(edge, 'node', 'title'))
		: undefined
}

describe('a function returning a page (D-182)', () => {
	it('pages the model connection with the function input', async () => {
		await serving({}, async (url) => {
			const first = await post(
				url,
				`{ paged(status: published, first: 1) { edges { node { title author { name } } } pageInfo { hasNextPage endCursor } totalCount } }`,
			)
			expect(first).toStrictEqual({
				data: {
					paged: {
						edges: [{ node: { title: 'one', author: { name: 'ada' } } }],
						pageInfo: {
							hasNextPage: true,
							endCursor: at(first, 'data', 'paged', 'pageInfo', 'endCursor'),
						},
						totalCount: 2,
					},
				},
			})
			const cursor = String(at(first, 'data', 'paged', 'pageInfo', 'endCursor'))
			const next = await post(
				url,
				`query ($after: String) { paged(status: published, after: $after) { edges { node { title } } pageInfo { hasNextPage } } }`,
				{ after: cursor },
			)
			expect(titles(at(next, 'data', 'paged'))).toStrictEqual(['three'])
			expect(at(next, 'data', 'paged', 'pageInfo', 'hasNextPage')).toBe(false)
			const last = await post(
				url,
				`{ paged(status: draft, last: 1) { edges { node { title } } pageInfo { hasPreviousPage } } }`,
			)
			expect(titles(at(last, 'data', 'paged'))).toStrictEqual(['two'])
			expect(at(last, 'data', 'paged', 'pageInfo', 'hasPreviousPage')).toBe(
				true,
			)
		})
	})

	it('is the model connection type', async () => {
		await serving({}, async (url) => {
			const read = await post(url, `{ paged(status: draft) { __typename } }`)
			expect(read).toStrictEqual({
				data: { paged: { __typename: 'PostConnection' } },
			})
		})
	})

	it('pages a type field, its relations read as the caller', async () => {
		await serving({}, async (url) => {
			const read = await post(
				url,
				`{ profile(name: "ada") { profile { user { name } posts(first: 2) { edges { node { title author { name email } } } totalCount } } } }`,
			)
			expect(at(read, 'data', 'profile', 'profile', 'user')).toStrictEqual({
				name: 'ada',
			})
			const page = at(read, 'data', 'profile', 'profile', 'posts')
			expect(titles(page)).toStrictEqual(['two', 'three'])
			expect(at(page, 'totalCount')).toBe(3)
			// email has a read rule that hides it from everyone.
			expect(at(page, 'edges', 0, 'node', 'author')).toStrictEqual({
				name: 'ada',
				email: null,
			})
			const none = await post(
				url,
				`{ profile(name: "eve") { profile { posts { totalCount } } } }`,
			)
			expect(none).toStrictEqual({ data: { profile: { profile: null } } })
		})
	})

	it('counts once however many aliases ask, and only when selected', async () => {
		const base = memory()
		let counts = 0
		const counting: Adapter = {
			...base,
			count: async (read) => {
				counts += 1
				return base.count(read)
			},
		}
		await serving(
			{},
			async (url) => {
				const paged = await post(
					url,
					`{ paged(status: draft) { edges { cursor } } }`,
				)
				expect(paged.errors).toBeUndefined()
				expect(counts).toBe(0)
				const counted = await post(
					url,
					`{ paged(status: draft) { a: totalCount b: totalCount } }`,
				)
				expect(counted).toStrictEqual({
					data: { paged: { a: 2, b: 2 } },
				})
				expect(counts).toBe(1)
			},
			counting,
		)
	})

	it('is bounded as the generated list and counted by the row budget', async () => {
		await serving({ maxRows: 150 }, async (url) => {
			const above = await post(url, `{ people(first: 4) { totalCount } }`)
			expect(above.errors?.map(({ message }) => message)).toStrictEqual([
				'first is at most 3 on User.',
			])
			const twice = await post(
				url,
				`{ a: paged(status: draft) { totalCount } b: paged(status: draft) { totalCount } }`,
			)
			expect(twice.errors?.map(({ message }) => message)).toStrictEqual([
				'The document asks for more than 150 rows. Ask for fewer with first or last.',
			])
			const nested = await post(
				url,
				`{ a: profile(name: "ada") { profile { posts { totalCount } } } b: profile(name: "bob") { profile { posts { totalCount } } } }`,
			)
			expect(nested.errors?.map(({ message }) => message)).toStrictEqual([
				'The document asks for more than 150 rows. Ask for fewer with first or last.',
			])
			const master = await post(
				url,
				`{ people(first: 4) { totalCount } }`,
				{},
				{
					'x-ultimabase-master-key': 'secret',
				},
			)
			expect(master).toStrictEqual({ data: { people: { totalCount: 2 } } })
		})
	})

	it('is a list of rows with pagination: list, and has no count', async () => {
		await serving({ pagination: 'list' }, async (url) => {
			const read = await post(
				url,
				`{ paged(status: published, take: 1, skip: 1) { title } }`,
			)
			expect(read).toStrictEqual({ data: { paged: [{ title: 'three' }] } })
			const counted = await post(
				url,
				`{ paged(status: published) { totalCount } }`,
			)
			expect(counted.errors?.[0]?.message).toContain('totalCount')
		})
	})

	it('refuses a page of another model, and an input named as a page argument', async () => {
		await serving({}, async (url) => {
			const read = await post(url, `{ wrong { totalCount } }`)
			expect(read.errors?.map(({ message }) => message)).toStrictEqual([
				'Internal error.',
			])
		})
		const clash = defineFunction({
			name: 'clash',
			query: true,
			input: z.object({ first: z.int() }),
			output: Post.paginated(),
			run: () => Post.paginate({}, M),
		}).with({ access: allow.public })
		await expect(started({}, memory(), [], [clash])).rejects.toThrow(
			'clash: its input property first is a page argument; rename it.',
		)
		const listed = defineFunction({
			name: 'listed',
			query: true,
			input: z.object({ first: z.int(), take: z.int().optional() }),
			output: Post.paginated(),
			run: () => Post.paginate({}, M),
		}).with({ access: allow.public })
		await expect(
			started({ pagination: 'list' }, memory(), [], [listed]),
		).rejects.toThrow(
			'listed: its input property take is a page argument; rename it.',
		)
	})
})

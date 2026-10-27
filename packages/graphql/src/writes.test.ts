// Writes over GraphQL (D-107): create, update and delete, relation writes,
// and the kernel's refusals as client errors.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { master } from 'ultimabase'
import type { Result } from './test/app.ts'
import { asMaster, at, post, seeded, started, User } from './test/app.ts'

let running: Awaited<ReturnType<typeof started>>
let ada = ''
let bob = ''
beforeAll(async () => {
	running = await started()
	;({ ada, bob } = await seeded())
})
afterAll(async () => running.app.stop())

const write = (query: string, variables?: object): Promise<Result> =>
	post(`${running.url}/graphql`, query, variables, asMaster)

describe('a create', () => {
	it('writes each scalar type and connects a relation', async () => {
		const result = await write(
			`mutation ($author: ID!) { createPost(data: {
				title: "five", slug: "five", status: draft, views: 1.5,
				meta: { tags: ["a"] }, publishedAt: "2026-02-01T00:00:00Z",
				author: { connect: { id: $author } }
			}) { title status views meta publishedAt author { name } } }`,
			{ author: bob },
		)
		expect(result).toStrictEqual({
			data: {
				createPost: {
					title: 'five',
					status: 'draft',
					views: 1.5,
					meta: { tags: ['a'] },
					publishedAt: '2026-02-01T00:00:00.000Z',
					author: { name: 'bob' },
				},
			},
		})
	})

	it('writes a field only Master reads', async () => {
		const result = await write(
			`mutation { createUser(data: {
				name: "cy", email: "cy@example.com", password: "hunter2"
			}) { name } }`,
		)
		expect(result).toStrictEqual({ data: { createUser: { name: 'cy' } } })
		const cy = await User.findUnique(
			{ where: { name: 'cy' }, select: { password: true } },
			{ as: master },
		)
		expect(cy?.password).toBe('hunter2')
	})

	it('requires the fields create needs, as its type does (D-53)', async () => {
		const missing = await write(
			`mutation { createPost(data: { title: "six" }) { id } }`,
		)
		expect(missing.errors?.map((error) => error.message)).toStrictEqual([
			'Expected value of type "PostCreateInput" to include required field "slug".',
			'Expected value of type "PostCreateInput" to include required field "status".',
			'Expected value of type "PostCreateInput" to include required field "author".',
		])
		// `views` has a default, `meta` and `publishedAt` are optional.
		const defaulted = await write(
			`mutation ($ada: ID!) { createPost(data: {
				title: "six", slug: "six", status: draft, author: { connect: { id: $ada } }
			}) { views meta publishedAt } }`,
			{ ada },
		)
		expect(defaulted).toStrictEqual({
			data: { createPost: { views: 0, meta: null, publishedAt: null } },
		})
	})

	it('creates the rows of a relation with its row', async () => {
		const result = await write(
			`mutation { createUser(data: { name: "eve", email: "e@example.com",
				posts: { create: [{ title: "seven", slug: "seven", status: draft }] }
			}) { posts { edges { node { title author { name } } } } } }`,
		)
		expect(at(result.data, 'createUser', 'posts', 'edges')).toStrictEqual([
			{ node: { title: 'seven', author: { name: 'eve' } } },
		])
		const created = await write(
			`mutation { createPost(data: { title: "eight", slug: "eight", status: draft,
				author: { create: { name: "fay", email: "f@example.com" } }
			}) { author { name } } }`,
		)
		expect(created).toStrictEqual({
			data: { createPost: { author: { name: 'fay' } } },
		})
	})

	it('takes no relation back in a row it creates', async () => {
		const result = await write(
			`mutation ($ada: ID!) { createUser(data: { name: "gus", email: "g@example.com",
				posts: { create: [{ title: "x", slug: "x", status: draft,
					author: { connect: { id: $ada } } }] }
			}) { id } }`,
			{ ada },
		)
		expect(result.errors?.map((error) => error.message)).toStrictEqual([
			'Expected value of type "PostCreateWithoutAuthorInput" not to include unknown field "author".',
		])
	})

	it('sends the kernel’s refusals as client errors', async () => {
		const denied = await post(
			`${running.url}/graphql`,
			`mutation { createUser(data: { name: "dee", email: "d@example.com" }) { id } }`,
		)
		expect(denied.errors?.[0]?.extensions).toMatchObject({
			code: 'ACCESS_DENIED',
		})
	})
})

describe('an update', () => {
	it('changes scalars and moves a relation', async () => {
		const result = await write(
			`mutation ($ada: ID!, $bob: ID!) { updatePost(
				where: { author_slug: { author: $ada, slug: "one" } },
				data: { views: 5, meta: null, author: { connect: { id: $bob } } }
			) { title views meta author { name } } }`,
			{ ada, bob },
		)
		expect(result).toStrictEqual({
			data: {
				updatePost: {
					title: 'one',
					views: 5,
					meta: null,
					author: { name: 'bob' },
				},
			},
		})
	})

	it('connects many rows at once', async () => {
		const two = await write(
			`query ($ada: ID!) { post(where: { author_slug: { author: $ada, slug: "two" } }) { id } }`,
			{ ada },
		)
		const result = await write(
			`mutation ($id: ID!) { updateUser(
				where: { name: "bob" },
				data: { posts: { connect: [{ id: $id }] } }
			) { posts(orderBy: [{ title: asc }]) { edges { node { title } } } } }`,
			{ id: at(two.data, 'post', 'id') },
		)
		expect(
			at(result.data, 'updateUser', 'posts', 'edges', 0, 'node', 'title'),
		).toBe('five')
		expect(at(result.data, 'updateUser', 'posts', 'edges')).toHaveLength(4)
	})

	it('creates rows beside the rows it connects', async () => {
		const result = await write(
			`mutation { updateUser(where: { name: "ada" }, data: { posts: {
				create: [{ title: "ten", slug: "ten", status: draft }]
			} }) { posts(where: { slug: { equals: "ten" } }) {
				edges { node { title author { name } } } } } }`,
		)
		expect(at(result.data, 'updateUser', 'posts', 'edges')).toStrictEqual([
			{ node: { title: 'ten', author: { name: 'ada' } } },
		])
	})

	it('takes one write on a one relation, and no disconnect when required', async () => {
		const both = await write(
			`mutation { updatePost(
				where: { id: "x" },
				data: { author: { connect: { id: "y" }, create: { name: "z", email: "z" } } }
			) { id } }`,
		)
		expect(both.errors?.[0]?.message).toContain('exactly one')
		const unset = await write(
			`mutation { updatePost(where: { id: "x" }, data: { author: { disconnect: true } }) { id } }`,
		)
		expect(unset.errors?.[0]?.message).toBe(
			'Expected value of type "UserUpdateOneRequiredWithoutPostsNestedInput" not to include unknown field "disconnect". Did you mean "connect"?',
		)
	})

	it('updates and deletes the rows a relation links, by any unique target (D-138)', async () => {
		const created = await write(
			`mutation { createUser(data: { name: "hal", email: "h@example.com", posts: { create: [
				{ title: "h1", slug: "h1", status: draft }, { title: "h2", slug: "h2", status: draft }
			] } }) { id } }`,
		)
		const hal = at(created.data, 'createUser', 'id')
		const result = await write(
			`mutation ($hal: ID!) { updateUser(where: { name: "hal" }, data: { posts: {
				update: [{ where: { author_slug: { author: $hal, slug: "h1" } }, data: { views: 3, meta: { n: 1 } } }],
				delete: [{ author_slug: { author: $hal, slug: "h2" } }]
			} }) { posts { edges { node { slug views meta } } } } }`,
			{ hal },
		)
		expect(at(result.data, 'updateUser', 'posts', 'edges')).toStrictEqual([
			{ node: { slug: 'h1', views: 3, meta: { n: 1 } } },
		])
		const author = await write(
			`mutation ($hal: ID!) { updatePost(
				where: { author_slug: { author: $hal, slug: "h1" } },
				data: { author: { update: { name: "hal2" } } }
			) { author { name } } }`,
			{ hal },
		)
		expect(author).toStrictEqual({
			data: { updatePost: { author: { name: 'hal2' } } },
		})
	})

	it('refuses a set that leaves a row without its required relation (D-138)', async () => {
		const result = await write(
			`mutation { updateUser(where: { name: "bob" }, data: { posts: { set: [] } }) { id } }`,
		)
		expect(result.errors?.[0]?.extensions).toStrictEqual({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['posts', 'set'],
						message: 'A Post cannot be left without its author.',
					},
				],
			},
		})
	})

	it('finds no row to update', async () => {
		const result = await write(
			`mutation { updateUser(where: { name: "nobody" }, data: { name: "x" }) { id } }`,
		)
		expect(result.errors?.[0]?.extensions).toMatchObject({ code: 'NOT_FOUND' })
	})
})

describe('a delete', () => {
	it('returns the row it deleted', async () => {
		const result = await write(
			`mutation ($bob: ID!) { deletePost(
				where: { author_slug: { author: $bob, slug: "four" } }
			) { title status views } }`,
			{ bob },
		)
		expect(result).toStrictEqual({
			data: { deletePost: { title: 'four', status: 'draft', views: 30 } },
		})
		const gone = await write(
			`query ($bob: ID!) { post(where: { author_slug: { author: $bob, slug: "four" } }) { id } }`,
			{ bob },
		)
		expect(gone).toStrictEqual({ data: { post: null } })
	})

	it('has no relation to select', async () => {
		const result = await write(
			`mutation { deleteUser(where: { name: "bob" }) { name posts { totalCount } } }`,
		)
		expect(result.errors?.[0]?.message).toBe(
			'Cannot query field "posts" on type "DeletedUser".',
		)
		const kept = await write(`{ user(where: { name: "bob" }) { name } }`)
		expect(kept).toStrictEqual({ data: { user: { name: 'bob' } } })
	})
})

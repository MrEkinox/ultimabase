import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// The GraphQL documents the documentation shows, POSTed in memory.
const anyString: unknown = expect.any(String)

const postGraphql = (query: string, variables?: Readonly<{ id: string }>) =>
	({
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'blog',
		},
		body: JSON.stringify({ query, variables }),
	}) satisfies RequestInit

const field = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

/** The created post's id, read from the answer like untrusted input. */
const readId = (answer: unknown): string => {
	const id = ['data', 'createPost', 'id'].reduce(field, answer)
	if (typeof id !== 'string') throw new TypeError('No created post id')
	return id
}

it('soft-deletes and restores a post over GraphQL', async () => {
	await using t = await testApplication(ultimabase)

	//#region graphql-create
	const created = await t.fetch('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'blog',
		},
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation CreatePost {
					createPost(input: { title: "Draft announcement" }) {
						id
						title
						isDeleted
					}
				}
			`,
		}),
	})
	//#endregion graphql-create

	expect(created.status).toBe(200)
	const answer: unknown = await created.json()
	//#region graphql-create-answer
	expect(answer).toStrictEqual({
		data: {
			createPost: {
				id: anyString,
				title: 'Draft announcement',
				isDeleted: false,
			},
		},
	})
	//#endregion graphql-create-answer
	const id = readId(answer)

	//#region graphql-soft-delete
	const deleted = await t.fetch('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'blog',
		},
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation SoftDeletePost($id: ID!) {
					softDeleteOnePost(input: { id: $id }) {
						id
						title
						isDeleted
					}
				}
			`,
			variables: { id },
		}),
	})
	//#endregion graphql-soft-delete

	expect(deleted.status).toBe(200)
	//#region graphql-soft-delete-answer
	expect(await deleted.json()).toStrictEqual({
		data: {
			softDeleteOnePost: {
				id,
				title: 'Draft announcement',
				isDeleted: true,
			},
		},
	})
	//#endregion graphql-soft-delete-answer

	//#region graphql-find-deleted
	const found = await t.fetch('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'blog',
		},
		body: JSON.stringify({
			query: /* GraphQL */ `
				query FindDeletedPost($id: ID!) {
					findOnePost(where: { id: { eq: $id } }) {
						id
						title
					}
				}
			`,
			variables: { id },
		}),
	})
	//#endregion graphql-find-deleted

	//#region graphql-find-deleted-answer
	expect(await found.json()).toStrictEqual({ data: { findOnePost: null } })
	//#endregion graphql-find-deleted-answer

	// A repeated soft deletion is a GraphQL error inside a 200 answer.
	const again = await t.fetch(
		'/graphql',
		postGraphql(
			'mutation SoftDeletePost($id: ID!) { softDeleteOnePost(input: { id: $id }) { id } }',
			{ id },
		),
	)
	expect(again.status).toBe(200)
	expect(await again.json()).toStrictEqual({
		data: { softDeleteOnePost: null },
		errors: [
			{
				message: 'The requested object was not found.',
				locations: [{ line: 1, column: 37 }],
				path: ['softDeleteOnePost'],
				extensions: {
					code: 'NOT_FOUND',
					requestId: anyString,
					retryable: false,
				},
			},
		],
	})

	const restored = await t.fetch(
		'/graphql',
		postGraphql(
			'mutation RestorePost($id: ID!) { restoreOnePost(input: { id: $id }) { id isDeleted } }',
			{ id },
		),
	)
	expect(await restored.json()).toStrictEqual({
		data: { restoreOnePost: { id, isDeleted: false } },
	})
	expect(await Post.count()).toBe(1)
})

it('takes only an id and exposes only the named commands', async () => {
	await using t = await testApplication(ultimabase)

	// `SoftDeleteOnePostInput` holds `id: ID!` alone.
	const input = await t.fetch(
		'/graphql',
		postGraphql(
			'{ __type(name: "SoftDeleteOnePostInput") { inputFields { name type { kind ofType { name } } } } }',
		),
	)
	expect(await input.json()).toStrictEqual({
		data: {
			__type: {
				inputFields: [
					{ name: 'id', type: { kind: 'NON_NULL', ofType: { name: 'ID' } } },
				],
			},
		},
	})

	// Purge and many-row commands have no field; `Comment`, whose rule names
	// no command, has no `softDeleteOneComment` either.
	for (const field of [
		'purgeOnePost',
		'softDeleteManyPost',
		'purgeManyPost',
		'softDeleteOneComment',
	]) {
		const response = await t.fetch(
			'/graphql',
			postGraphql(`mutation { ${field}(input: { id: "x" }) { id } }`),
		)
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({
			errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
		})
	}
})

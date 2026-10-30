// Uses the generated API as a client would, each test on a new in-memory
// database seeded with Ada's three posts.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Post, Revision } from './models.ts'

const running = testApplication(app)

//#region request
/** A GraphQL request's response body, as a client sends it. */
async function graphql(
	query: string,
	variables: object = {},
	headers: object = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}
//#endregion

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const anId: unknown = expect.any(String)
const aCursor: unknown = expect.any(String)

//#region create
/** Ada and her three posts, created in one write. */
const seed = () =>
	graphql(`
		mutation {
			createPerson(
				data: {
					name: "Ada"
					posts: {
						create: [
							{ title: "Notes", slug: "notes", likes: 12, status: published }
							{ title: "Sketch", slug: "sketch", likes: 3 }
							{ title: "Plans", slug: "plans", likes: 7, status: published }
						]
					}
				}
			) {
				id
				name
				posts {
					edges {
						node {
							slug
						}
					}
				}
			}
		}
	`)
//#endregion

let seeded: unknown
let ada = ''

beforeEach(async () => {
	seeded = await seed()
	ada = String(at(seeded, 'data', 'createPerson', 'id'))
})

describe('reads', () => {
	it('created a person and their posts in one write', () => {
		//#region created
		expect(seeded).toEqual({
			data: {
				createPerson: {
					id: anId,
					name: 'Ada',
					posts: {
						edges: [
							{ node: { slug: 'notes' } },
							{ node: { slug: 'sketch' } },
							{ node: { slug: 'plans' } },
						],
					},
				},
			},
		})
		//#endregion
	})

	it('reads a page, then the next one after its cursor', async () => {
		//#region page
		const page = `query ($after: String) {
			posts(first: 2, after: $after, orderBy: [{ likes: desc }]) {
				totalCount
				edges { cursor node { title likes } }
				pageInfo { hasNextPage endCursor }
			}
		}`
		const first = await graphql(page)
		expect(at(first, 'data', 'posts')).toEqual({
			totalCount: 3,
			edges: [
				{ cursor: aCursor, node: { title: 'Notes', likes: 12 } },
				{ cursor: aCursor, node: { title: 'Plans', likes: 7 } },
			],
			pageInfo: { hasNextPage: true, endCursor: aCursor },
		})
		const after = at(first, 'data', 'posts', 'pageInfo', 'endCursor')
		const next = await graphql(page, { after })
		expect(at(next, 'data', 'posts', 'edges')).toEqual([
			{ cursor: aCursor, node: { title: 'Sketch', likes: 3 } },
		])
		//#endregion
	})

	it('filters on fields and on relations', async () => {
		//#region filter
		const body = await graphql(`
			{
				posts(
					where: {
						status: { equals: published }
						likes: { gte: 10 }
						author: { is: { name: { startsWith: "A" } } }
					}
				) {
					edges {
						node {
							title
						}
					}
				}
				people(where: { posts: { some: { likes: { lt: 5 } } } }) {
					edges {
						node {
							name
						}
					}
				}
			}
		`)
		expect(body).toEqual({
			data: {
				posts: { edges: [{ node: { title: 'Notes' } }] },
				people: { edges: [{ node: { name: 'Ada' } }] },
			},
		})
		//#endregion
	})

	it('reads one row by a unique field, null when absent', async () => {
		//#region unique
		const body = await graphql(`
			{
				notes: post(where: { slug: "notes" }) {
					title
					author {
						name
					}
				}
				missing: post(where: { slug: "nowhere" }) {
					title
				}
			}
		`)
		expect(body).toEqual({
			data: {
				notes: { title: 'Notes', author: { name: 'Ada' } },
				missing: null,
			},
		})
		//#endregion
	})

	it('serves a query over GET', async () => {
		//#region get
		const query = encodeURIComponent(
			'{ post(where: { slug: "notes" }) { title } }',
		)
		const response = await fetch(`${running.url}/graphql?query=${query}`)
		expect(await response.json()).toEqual({
			data: { post: { title: 'Notes' } },
		})
		//#endregion
	})
})

describe('writes', () => {
	it('updates a row by a unique field', async () => {
		//#region update
		const body = await graphql(`
			mutation {
				updatePost(
					where: { slug: "sketch" }
					data: { likes: 4, status: published }
				) {
					title
					likes
					status
				}
			}
		`)
		expect(body).toEqual({
			data: { updatePost: { title: 'Sketch', likes: 4, status: 'published' } },
		})
		//#endregion
	})

	it('creates the row an upsert does not find, then updates it', async () => {
		//#region upsert
		const upsert = `mutation ($ada: ID!) {
			upsertPost(
				where: { slug: "ideas" }
				create: { title: "Ideas", slug: "ideas", author: { connect: { id: $ada } } }
				update: { likes: 1 }
			) { title likes }
		}`
		expect(await graphql(upsert, { ada })).toEqual({
			data: { upsertPost: { title: 'Ideas', likes: 0 } },
		})
		expect(await graphql(upsert, { ada })).toEqual({
			data: { upsertPost: { title: 'Ideas', likes: 1 } },
		})
		//#endregion
	})

	it('deletes a row, and answers it as it was', async () => {
		//#region delete
		const body = await graphql(`
			mutation {
				deletePost(where: { slug: "plans" }) {
					id
					title
				}
			}
		`)
		expect(body).toEqual({
			data: { deletePost: { id: anId, title: 'Plans' } },
		})
		//#endregion
	})

	it('sends a kernel error with its code and details', async () => {
		//#region errors
		const body = await graphql(
			`
				mutation ($ada: ID!) {
					createPost(
						data: {
							title: "Again"
							slug: "notes"
							author: { connect: { id: $ada } }
						}
					) {
						id
					}
				}
			`,
			{ ada },
		)
		expect(body).toEqual({
			data: null,
			errors: [
				{
					message: 'Unique constraint failed on Post (slug).',
					locations: [{ line: 3, column: 6 }],
					path: ['createPost'],
					extensions: {
						code: 'UNIQUE_VIOLATION',
						details: { model: 'Post', fields: ['slug'] },
					},
				},
			],
		})
		//#endregion
	})
})

describe('names', () => {
	it('serves the names a model and a function set', async () => {
		//#region names
		const body = await graphql(`
			{
				people {
					edges {
						node {
							name
						}
					}
				}
				trending(count: 1) {
					title
				}
			}
		`)
		expect(body).toEqual({
			data: {
				people: { edges: [{ node: { name: 'Ada' } }] },
				trending: [{ title: 'Notes' }],
			},
		})
		//#endregion
	})

	it('reads a hidden model through its relation only', async () => {
		//#region hidden
		const notes = await Post.findUniqueOrThrow(
			{ where: { slug: 'notes' } },
			{ as: master },
		)
		await Revision.create(
			{ data: { text: 'First draft', post: { connect: { id: notes.id } } } },
			{ as: master },
		)
		const body = await graphql(`
			{
				post(where: { slug: "notes" }) {
					revisions {
						edges {
							node {
								text
							}
						}
					}
				}
			}
		`)
		expect(body).toEqual({
			data: {
				post: { revisions: { edges: [{ node: { text: 'First draft' } }] } },
			},
		})
		const root = await graphql('{ revisions { totalCount } }')
		expect(at(root, 'errors', '0', 'message')).toBe(
			'Cannot query field "revisions" on type "Query".',
		)
		const hidden = await graphql('mutation { reindex }')
		expect(at(hidden, 'errors', '0', 'message')).toBe(
			'Cannot query field "reindex" on type "Mutation".',
		)
		//#endregion
	})

	it('runs the fields extend adds as the caller', async () => {
		//#region extended
		const body = await graphql('{ me drafts { title author { name } } }')
		expect(body).toEqual({
			data: {
				me: 'anonymous',
				drafts: [{ title: 'Sketch', author: { name: 'Ada' } }],
			},
		})
		//#endregion
	})
})

describe('limits', () => {
	it('refuses a document over the limits, unless Master sends it', async () => {
		//#region limits
		const message = async (query: string) =>
			at(await graphql(query), 'errors', '0', 'message')
		// The model's maxTake.
		expect(await message('{ posts(first: 21) { totalCount } }')).toBe(
			'first is at most 20 on Post.',
		)
		// maxDepth: 8 levels, the leaf `name` included.
		expect(
			await message(
				'{ people { edges { node { posts { edges { node { author { name } } } } } } } }',
			),
		).toBe('The document is nested 8 levels deep; the most is 6.')
		// maxRows: 100 people and 20 posts of each.
		const rows =
			'{ people(first: 100) { edges { node { posts(first: 20) { edges { cursor } } } } } }'
		expect(await message(rows)).toBe(
			'The document asks for more than 2,000 rows. Ask for fewer with first or last.',
		)
		// Master is not limited.
		const key = { 'x-ultimabase-master-key': 'dev-master-key' }
		expect(at(await graphql(rows, {}, key), 'errors')).toBeUndefined()
		//#endregion
	})
})

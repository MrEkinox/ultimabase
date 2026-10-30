// Uses the generated API as a client would, each test on a new in-memory
// database seeded with Ada's three posts.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.ts'
import { Post, Revision } from './models.ts'

const running = testApplication(app)

//#region request
/** A REST request's status and JSON body, as a client sends it. */
async function api(
	path: string,
	init: Omit<RequestInit, 'headers'> & {
		readonly headers?: { readonly [name: string]: string }
	} = {},
) {
	const response = await fetch(`${running.url}/api${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...init.headers },
	})
	const body: unknown = await response.json()
	return { status: response.status, body }
}

/** A query string: each value as JSON, a string as is. */
const query = (params: { [name: string]: unknown }): string =>
	`?${new URLSearchParams(
		Object.fromEntries(
			Object.entries(params).map(([name, value]) => [
				name,
				typeof value === 'string' ? value : JSON.stringify(value),
			]),
		),
	).toString()}`
//#endregion

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const anId: unknown = expect.any(String)
const aDate: unknown = expect.any(String)
const aCursor: unknown = expect.any(String)

//#region create
/** Ada and her three posts, created in one write. */
const seed = () =>
	api(`/people${query({ include: { posts: { select: { slug: true } } } })}`, {
		method: 'POST',
		body: JSON.stringify({
			name: 'Ada',
			posts: {
				create: [
					{ title: 'Notes', slug: 'notes', likes: 12, status: 'published' },
					{ title: 'Sketch', slug: 'sketch', likes: 3 },
					{ title: 'Plans', slug: 'plans', likes: 7, status: 'published' },
				],
			},
		}),
	})
//#endregion

let seeded: unknown
let ada = ''

beforeEach(async () => {
	seeded = await seed()
	ada = String(at(seeded, 'body', 'id'))
})

describe('reads', () => {
	it('created a person and their posts in one write', () => {
		//#region created
		expect(seeded).toEqual({
			status: 201,
			body: {
				id: anId,
				createdAt: aDate,
				updatedAt: aDate,
				name: 'Ada',
				posts: {
					edges: [
						{ cursor: aCursor, node: { slug: 'notes' } },
						{ cursor: aCursor, node: { slug: 'sketch' } },
						{ cursor: aCursor, node: { slug: 'plans' } },
					],
					pageInfo: {
						hasNextPage: false,
						hasPreviousPage: false,
						startCursor: aCursor,
						endCursor: aCursor,
					},
				},
			},
		})
		//#endregion
	})

	it('reads a page, then the next one after its cursor', async () => {
		//#region page
		const select = { title: true }
		const orderBy = { likes: 'desc' }
		const first = await api(
			`/posts${query({ first: 2, orderBy, select, totalCount: true })}`,
		)
		expect(first.body).toMatchObject({
			edges: [{ node: { title: 'Notes' } }, { node: { title: 'Plans' } }],
			pageInfo: { hasNextPage: true },
			totalCount: 3,
		})
		const after = String(at(first.body, 'pageInfo', 'endCursor'))
		const next = await api(
			`/posts${query({ first: 2, after, orderBy, select })}`,
		)
		expect(next.body).toMatchObject({
			edges: [{ node: { title: 'Sketch' } }],
			pageInfo: { hasNextPage: false },
		})
		//#endregion
	})

	it('reads a row with its scalar fields, and no relation', async () => {
		//#region row
		const { body } = await api('/posts')
		const notes = String(at(body, 'edges', '0', 'node', 'id'))
		expect(await api(`/posts/${notes}`)).toEqual({
			status: 200,
			body: {
				id: notes,
				createdAt: aDate,
				updatedAt: aDate,
				title: 'Notes',
				slug: 'notes',
				status: 'published',
				likes: 12,
				publishedAt: null,
			},
		})
		expect(await api('/posts/nowhere')).toEqual({
			status: 404,
			body: { code: 'NOT_FOUND', message: 'No Post matches.' },
		})
		//#endregion
	})

	it('picks fields with select, adds relations with include', async () => {
		//#region fields
		const selected = await api(
			`/people/${ada}${query({
				select: {
					name: true,
					posts: {
						first: 1,
						orderBy: { likes: 'asc' },
						select: { slug: true },
					},
				},
			})}`,
		)
		expect(selected.body).toEqual({
			name: 'Ada',
			posts: {
				edges: [{ cursor: aCursor, node: { slug: 'sketch' } }],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: aCursor,
					endCursor: aCursor,
				},
			},
		})
		const included = await api(
			`/posts${query({
				where: { slug: { equals: 'notes' } },
				include: { author: true },
			})}`,
		)
		expect(at(included.body, 'edges', '0', 'node')).toMatchObject({
			title: 'Notes',
			likes: 12,
			author: { name: 'Ada' },
		})
		//#endregion
	})

	it('filters on fields and on relations', async () => {
		//#region filter
		const where = {
			status: { equals: 'published' },
			likes: { gte: 10 },
			author: { is: { name: { startsWith: 'A' } } },
		}
		const posts = await api(
			`/posts${query({ where, select: { title: true } })}`,
		)
		expect(posts.body).toMatchObject({ edges: [{ node: { title: 'Notes' } }] })
		const people = await api(
			`/people${query({
				where: { posts: { some: { likes: { lt: 5 } } } },
				select: { name: true },
			})}`,
		)
		expect(people.body).toMatchObject({ edges: [{ node: { name: 'Ada' } }] })
		//#endregion
	})

	it('reads and writes dates as ISO 8601 text', async () => {
		//#region dates
		const { body } = await api('/posts', {
			method: 'POST',
			body: JSON.stringify({
				title: 'Launch',
				slug: 'launch',
				publishedAt: '2026-07-31T09:00:00.000Z',
				author: { connect: { id: ada } },
			}),
		})
		expect(body).toMatchObject({ publishedAt: '2026-07-31T09:00:00.000Z' })
		const where = { publishedAt: { gte: '2026-07-01T00:00:00.000Z' } }
		const later = await api(`/posts${query({ where, select: { slug: true } })}`)
		expect(later.body).toMatchObject({ edges: [{ node: { slug: 'launch' } }] })
		//#endregion
	})
})

describe('writes', () => {
	it('updates a row named in the path', async () => {
		//#region update
		const { body } = await api(
			`/posts${query({ where: { slug: { equals: 'sketch' } } })}`,
		)
		const sketch = String(at(body, 'edges', '0', 'node', 'id'))
		const updated = await api(
			`/posts/${sketch}${query({ select: { likes: true, status: true } })}`,
			{
				method: 'PATCH',
				body: JSON.stringify({ likes: 4, status: 'published' }),
			},
		)
		expect(updated).toEqual({
			status: 200,
			body: { likes: 4, status: 'published' },
		})
		//#endregion
	})

	it('creates the row an upsert does not find, then updates it', async () => {
		//#region upsert
		const path = `/posts${query({ select: { slug: true, likes: true } })}`
		const ideas = {
			method: 'PUT',
			body: JSON.stringify({
				where: { slug: 'ideas' },
				create: {
					title: 'Ideas',
					slug: 'ideas',
					author: { connect: { id: ada } },
				},
				update: { likes: 1 },
			}),
		}
		expect(await api(path, ideas)).toEqual({
			status: 201,
			body: { slug: 'ideas', likes: 0 },
		})
		expect(await api(path, ideas)).toEqual({
			status: 200,
			body: { slug: 'ideas', likes: 1 },
		})
		//#endregion
	})

	it('deletes a row, and answers it as it was', async () => {
		//#region delete
		const { body } = await api(
			`/posts${query({ where: { slug: { equals: 'plans' } } })}`,
		)
		const plans = String(at(body, 'edges', '0', 'node', 'id'))
		const deleted = await api(`/posts/${plans}`, { method: 'DELETE' })
		expect(deleted).toMatchObject({
			status: 200,
			body: { id: plans, title: 'Plans', slug: 'plans' },
		})
		expect(await api(`/posts/${plans}`)).toMatchObject({ status: 404 })
		//#endregion
	})

	it('sends a kernel error with its status, code and details', async () => {
		//#region errors
		const duplicate = await api('/posts', {
			method: 'POST',
			body: JSON.stringify({
				title: 'Notes again',
				slug: 'notes',
				author: { connect: { id: ada } },
			}),
		})
		expect(duplicate).toEqual({
			status: 409,
			body: {
				code: 'UNIQUE_VIOLATION',
				message: 'Unique constraint failed on Post (slug).',
				details: { model: 'Post', fields: ['slug'] },
			},
		})
		expect(await api('/posts?first=two')).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: 'The query parameter first is not JSON.',
			},
		})
		expect(await api('/posts?limit=10')).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message:
					"Unknown query parameter 'limit'; this route takes where, orderBy, select, include, first, last, totalCount, after, before.",
			},
		})
		//#endregion
	})
})

describe('names', () => {
	it('serves the names a model and a function set', async () => {
		//#region names
		expect(
			await api(`/people${query({ select: { name: true } })}`),
		).toMatchObject({
			status: 200,
			body: { edges: [{ node: { name: 'Ada' } }] },
		})
		const trending = await api(`/functions/trending${query({ count: 1 })}`)
		expect(trending).toMatchObject({ status: 200, body: [{ title: 'Notes' }] })
		const liked = await api('/functions/like', {
			method: 'POST',
			body: JSON.stringify({ slug: 'sketch' }),
		})
		expect(liked).toMatchObject({
			status: 200,
			body: { slug: 'sketch', likes: 4 },
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
		const read = await api(
			`/posts/${notes.id}${query({ select: { revisions: { select: { text: true } } } })}`,
		)
		expect(read.body).toMatchObject({
			revisions: { edges: [{ node: { text: 'First draft' } }] },
		})
		expect(await api('/revisions')).toMatchObject({ status: 404 })
		expect(await api('/functions/reindex', { method: 'POST' })).toMatchObject({
			status: 404,
		})
		//#endregion
	})
})

describe('the API', () => {
	it('answers as GraphQL does, with the same arguments', async () => {
		//#region twin
		const where = { likes: { gt: 10 } }
		const select = { title: true, author: { select: { name: true } } }
		const rest = await api(`/posts${query({ where, select })}`)
		const response = await fetch(`${running.url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				query:
					'{ posts(where: { likes: { gt: 10 } }) { edges { cursor node { title author { name } } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }',
			}),
		})
		const answer: unknown = await response.json()
		expect(answer).toEqual({ data: { posts: rest.body } })
		//#endregion
	})

	it('serves its OpenAPI document', async () => {
		//#region openapi
		const { body } = await api('/openapi.json')
		expect(body).toMatchObject({
			openapi: '3.1.0',
			info: { title: 'UltimaBase REST API' },
			servers: [{ url: '/api' }],
		})
		const paths = at(body, 'paths')
		expect(
			typeof paths === 'object' && paths !== null ? Object.keys(paths) : [],
		).toEqual([
			'/people',
			'/people/{id}',
			'/posts',
			'/posts/{id}',
			'/functions/trending',
			'/functions/like',
		])
		//#endregion
	})

	it('refuses a request over the limits, unless Master sends it', async () => {
		//#region limits
		expect(await api(`/posts${query({ first: 21 })}`)).toMatchObject({
			status: 400,
			body: { message: 'first is at most 20 on Post.' },
		})
		const author = {
			include: { posts: { first: 2, include: { author: true } } },
		}
		const deep = query({
			first: 1,
			include: { posts: { first: 2, include: { author: author } } },
		})
		expect(await api(`/people${deep}`)).toMatchObject({
			status: 400,
			body: {
				message:
					'The request is nested 5 levels deep, its orderBy included; the most is 4.',
			},
		})
		const many = query({ first: 100, include: { posts: { first: 20 } } })
		expect(await api(`/people${many}`)).toMatchObject({
			status: 400,
			body: {
				message:
					'The request asks for more than 2,000 rows. Ask for fewer with first or last.',
			},
		})
		const asMaster = {
			headers: { 'x-ultimabase-master-key': 'dev-master-key' },
		}
		expect(await api(`/people${deep}`, asMaster)).toMatchObject({ status: 200 })
		//#endregion
	})
})

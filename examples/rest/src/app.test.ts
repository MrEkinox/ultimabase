// Uses the generated API as a client would, each test on a new in-memory
// database seeded with Ada's three posts. Each request file a page shows is
// sent here and its response compared with its JSON file (D-282).
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Post, Revision } from './models.ts'

const running = testApplication(app)
const { file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)

/** A REST request's status and JSON body, for what no request file shows. */
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

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** The id of the post with this slug. */
const idOf = async (slug: string): Promise<string> =>
	(await Post.findUniqueOrThrow({ where: { slug } }, { as: master })).id

let ada = ''

beforeEach(async () => {
	const seeded = await check('create', {}, { status: 201 })
	ada = String(at(seeded, 'id'))
})

describe('reads', () => {
	it('reads a page, then the next one after its cursor', async () => {
		const first = await check('page', {}, { status: 200 })
		const after = at(first, 'pageInfo', 'endCursor')
		await check('next', { after }, { status: 200 })
	})

	it('reads a row with its scalar fields, and no relation', async () => {
		const id = await idOf('notes')
		await check('get', { id }, { status: 200 })
		await check('missing', {}, { status: 404 })
	})

	it('picks fields with select, adds relations with include', async () => {
		await check('select', { id: ada }, { status: 200 })
		await check('include', { id: await idOf('notes') }, { status: 200 })
	})

	it('filters on fields and on relations', async () => {
		await check('filter', {}, { status: 200 })
		await check('some', {}, { status: 200 })
	})

	it('reads and writes dates as ISO 8601 text', async () => {
		await check('launch', { id: ada }, { status: 201 })
		await check('since', {}, { status: 200 })
	})
})

describe('writes', () => {
	it('updates a row named in the path', async () => {
		await check('update', { id: await idOf('sketch') }, { status: 200 })
	})

	it('creates the row an upsert does not find, then updates it', async () => {
		await check('upsert', { id: ada }, { status: 201 })
		expect(await file('upsert', { id: ada }, { status: 200 })).toEqual({
			slug: 'ideas',
			likes: 1,
		})
	})

	it('deletes a row, and answers it as it was', async () => {
		const id = await idOf('plans')
		await check('delete', { id }, { status: 200 })
		await file('get', { id }, { status: 404 })
	})

	it('refuses a number operation, a write sets values', async () => {
		expect(
			await api(`/posts/${await idOf('notes')}`, {
				method: 'PATCH',
				body: JSON.stringify({ likes: { increment: 1 } }),
			}),
		).toMatchObject({
			status: 400,
			body: { message: 'data.likes must be a number.' },
		})
	})

	it('sends a kernel error with its status, code and details', async () => {
		await check('duplicate', { id: ada }, { status: 409 })
		await check('notjson', {}, { status: 400 })
		expect(await api('/posts?limit=10')).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message:
					"Unknown query parameter 'limit'; this route takes where, orderBy, select, include, first, last, totalCount, after, before.",
			},
		})
	})
})

describe('names', () => {
	it('serves the names a model and a function set', async () => {
		await check('people', {}, { status: 200 })
		await check('trending', {}, { status: 200 })
		await check('like', {}, { status: 200 })
	})

	it('reads a hidden model through its relation only', async () => {
		const notes = await idOf('notes')
		await Revision.create(
			{ data: { text: 'First draft', post: { connect: { id: notes } } } },
			{ as: master },
		)
		await check('revisions', { id: notes }, { status: 200 })
		expect(await api('/revisions')).toMatchObject({ status: 404 })
		expect(await api('/functions/reindex', { method: 'POST' })).toMatchObject({
			status: 404,
		})
	})
})

describe('the API', () => {
	it('answers as GraphQL does, with the same arguments', async () => {
		const rest = await check('twin', {}, { status: 200 })
		expect(await check('twin-graphql', {}, { status: 200 })).toEqual({
			data: { posts: rest },
		})
	})

	it('serves its OpenAPI document', async () => {
		const body = await file('openapi', {}, { status: 200 })
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
	})

	it('refuses a request over the limits, unless Master sends it', async () => {
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
	})
})

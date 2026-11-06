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
const { send, file, check } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

let ada = ''

beforeEach(async () => {
	const seeded = await check('create')
	ada = String(at(seeded, 'data', 'createPerson', 'id'))
})

describe('reads', () => {
	it('sends a document as JSON over POST', async () => {
		await check('post')
	})

	it('reads a page, then the next one after its cursor', async () => {
		const first = await check('page')
		const after = at(first, 'data', 'posts', 'pageInfo', 'endCursor')
		const next = await file('page', { after })
		expect(at(next, 'data', 'posts', 'edges')).toEqual([
			{
				cursor: expect.any(String) as unknown,
				node: { title: 'Sketch', likes: 3 },
			},
		])
	})

	it('filters on fields and on relations', async () => {
		await check('filter')
	})

	it('reads one row by a unique field, null when absent', async () => {
		await check('unique')
	})

	it('serves a query over GET', async () => {
		await check('get')
	})
})

describe('writes', () => {
	it('updates a row by a unique field', async () => {
		await check('update')
	})

	it('creates the row an upsert does not find, then updates it', async () => {
		await check('upsert', { ada })
		expect(await file('upsert', { ada })).toEqual({
			data: { upsertPost: { title: 'Ideas', likes: 1 } },
		})
	})

	it('deletes a row, and answers it as it was', async () => {
		await check('delete')
	})

	it('sends a kernel error with its code and details', async () => {
		await check('duplicate', { ada })
	})
})

describe('names', () => {
	it('serves the names a model and a function set', async () => {
		await check('names')
	})

	it('reads a hidden model through its relation only', async () => {
		const notes = await Post.findUniqueOrThrow(
			{ where: { slug: 'notes' } },
			{ as: master },
		)
		await Revision.create(
			{ data: { text: 'First draft', post: { connect: { id: notes.id } } } },
			{ as: master },
		)
		await check('hidden')
		const root = await send('{ revisions { totalCount } }')
		expect(at(root, 'errors', '0', 'message')).toBe(
			'Cannot query field "revisions" on type "Query".',
		)
		const hidden = await send('mutation { reindex }')
		expect(at(hidden, 'errors', '0', 'message')).toBe(
			'Cannot query field "reindex" on type "Mutation".',
		)
	})

	it('runs the fields extend adds as the caller', async () => {
		await check('extended')
	})
})

describe('limits', () => {
	it('refuses a document over the limits, unless Master sends it', async () => {
		const message = async (query: string) =>
			at(await send(query), 'errors', '0', 'message')
		// The model's maxTake.
		expect(await message('{ posts(first: 21) { totalCount } }')).toBe(
			'first is at most 20 on Post.',
		)
		// maxDepth: 5 levels, the leaf `title` included; edges and node are none.
		expect(
			await message(
				'{ people { edges { node { posts { edges { node { author { posts { edges { node { title } } } } } } } } } } }',
			),
		).toBe('The document is nested 5 levels deep; the most is 4.')
		// maxRows: 100 people and 20 posts of each.
		const rows =
			'{ people(first: 100) { edges { node { posts(first: 20) { edges { cursor } } } } } }'
		expect(await message(rows)).toBe(
			'The document asks for more than 2,000 rows. Ask for fewer with first or last.',
		)
		// Master is not limited.
		const key = { 'x-ultimabase-master-key': 'dev-master-key' }
		expect(at(await send(rows, {}, { headers: key }), 'errors')).toBeUndefined()
	})

	it('refuses a relation selected twice with different arguments', async () => {
		await check('twice')
		expect(at(await file('once'), 'errors')).toBeUndefined()
	})
})

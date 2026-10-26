// Uses the relations as a client would, over GraphQL, each test on a new
// in-memory database.
import { testApplication } from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: (string | number)[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** Ursula, her two books at one publisher, and their tags; returns the ids. */
async function written() {
	const publisher = await request(
		'mutation { createPublisher(data: { name: "Ace" }) { id } }',
	)
	const body = await request(
		`mutation ($publisher: ID!) { createAuthor(data: { name: "Ursula", books: { create: [
			{ title: "The Dispossessed", publisher: { connect: { id: $publisher } },
				tags: { create: [{ label: "utopia" }, { label: "classic" }] } },
			{ title: "The Lathe of Heaven", publisher: { connect: { id: $publisher } } }
		] } }) { id books(orderBy: [{ title: asc }]) { edges { node { id } } } } }`,
		{ publisher: at(publisher, 'data', 'createPublisher', 'id') },
	)
	const author = at(body, 'data', 'createAuthor')
	return {
		author: String(at(author, 'id')),
		publisher: String(at(publisher, 'data', 'createPublisher', 'id')),
		lathe: String(at(author, 'books', 'edges', 1, 'node', 'id')),
	}
}

const titles = (edges: unknown) =>
	Array.isArray(edges) ? edges.map((edge) => at(edge, 'node', 'title')) : edges

describe('writing relations', () => {
	it('creates an author, her books and their tags in one write', async () => {
		const { author } = await written()
		const body = await request(
			`query ($id: ID!) { author(where: { id: $id }) {
				books(orderBy: [{ title: asc }]) { edges { node {
					title publisher { name } tags(orderBy: [{ label: asc }]) { edges { node { label } } }
				} } }
			} }`,
			{ id: author },
		)
		expect(at(body, 'data', 'author', 'books', 'edges')).toEqual([
			{
				node: {
					title: 'The Dispossessed',
					publisher: { name: 'Ace' },
					tags: {
						edges: [
							{ node: { label: 'classic' } },
							{ node: { label: 'utopia' } },
						],
					},
				},
			},
			{
				node: {
					title: 'The Lathe of Heaven',
					publisher: { name: 'Ace' },
					tags: { edges: [] },
				},
			},
		])
	})

	it('reads a many-to-many from either side, and connects a row to it', async () => {
		const { lathe } = await written()
		const tag = await request(
			'{ tags(where: { label: { equals: "classic" } }) { edges { node { id } } } }',
		)
		const connected = await request(
			`mutation ($id: ID!, $tag: ID!) {
				updateBook(where: { id: $id }, data: { tags: { connect: [{ id: $tag }] } }) { title }
			}`,
			{ id: lathe, tag: at(tag, 'data', 'tags', 'edges', 0, 'node', 'id') },
		)
		expect(connected).toEqual({
			data: { updateBook: { title: 'The Lathe of Heaven' } },
		})
		const body = await request(
			'{ tag(where: { label: "classic" }) { books(orderBy: [{ title: asc }]) { edges { node { title } } } } }',
		)
		expect(titles(at(body, 'data', 'tag', 'books', 'edges'))).toEqual([
			'The Dispossessed',
			'The Lathe of Heaven',
		])
	})
})

describe('deleting a target', () => {
	it('deletes an author’s books with her, and keeps the tags', async () => {
		const { author } = await written()
		const deleted = await request(
			'mutation ($id: ID!) { deleteAuthor(where: { id: $id }) { name } }',
			{ id: author },
		)
		expect(deleted).toEqual({ data: { deleteAuthor: { name: 'Ursula' } } })
		const left = await request('{ books { totalCount } tags { totalCount } }')
		expect(left).toEqual({
			data: { books: { totalCount: 0 }, tags: { totalCount: 2 } },
		})
	})

	it('keeps a publisher while a book references it', async () => {
		const { publisher } = await written()
		const refused = await request(
			'mutation ($id: ID!) { deletePublisher(where: { id: $id }) { name } }',
			{ id: publisher },
		)
		expect(refused).toMatchObject({
			errors: [{ extensions: { code: 'RELATION_RESTRICTED' } }],
		})
	})
})

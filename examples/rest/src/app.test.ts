// Uses one model over REST and over GraphQL, as clients would, each test on
// a new in-memory database: the same arguments give the same answers.
import { testApplication } from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'
import { app } from './app.ts'

const running = testApplication(app)

/** A REST response's status and body. */
async function api(method: string, path: string, body?: object) {
	const response = await fetch(`${running.url}/api${path}`, {
		method,
		headers: { 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
	const json: unknown = await response.json()
	return { status: response.status, body: json }
}

/** A GraphQL request's `data`, or its errors. */
async function graphql(query: string): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	return response.json()
}

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

const json = (value: object) => encodeURIComponent(JSON.stringify(value))

/** Ada and two posts, written over REST; returns her id. */
async function written(): Promise<string> {
	const ada = await api('POST', '/authors', {
		name: 'Ada',
		posts: {
			create: [
				{ title: 'Notes', likes: 12 },
				{ title: 'Sketch', likes: 3 },
			],
		},
	})
	return String(at(ada.body, 'id'))
}

describe('one model, two transports', () => {
	it('creates over REST, and reads it back over GraphQL', async () => {
		await written()
		expect(
			await graphql(
				'{ posts(orderBy: [{ title: asc }]) { edges { node { title author { name } } } } }',
			),
		).toEqual({
			data: {
				posts: {
					edges: [
						{ node: { title: 'Notes', author: { name: 'Ada' } } },
						{ node: { title: 'Sketch', author: { name: 'Ada' } } },
					],
				},
			},
		})
	})

	it('reads with GraphQL’s arguments, and answers with its JSON', async () => {
		await written()
		const where = json({ likes: { gt: 10 } })
		const select = json({ title: true, author: { select: { name: true } } })
		const rest = await api('GET', `/posts?where=${where}&select=${select}`)
		const query = await graphql(
			'{ posts(where: { likes: { gt: 10 } }) { edges { node { title author { name } } } } }',
		)
		const node = { title: 'Notes', author: { name: 'Ada' } }
		expect(rest).toMatchObject({ status: 200, body: { edges: [{ node }] } })
		expect(query).toEqual({ data: { posts: { edges: [{ node }] } } })
	})

	it('updates and deletes a row named in the path', async () => {
		const ada = await written()
		const renamed = await api('PATCH', `/authors/${ada}`, { name: 'Ada L.' })
		expect(renamed).toMatchObject({ status: 200, body: { name: 'Ada L.' } })
		// Her posts need her: a required relation keeps her while they exist.
		expect(await api('DELETE', `/authors/${ada}`)).toMatchObject({
			status: 409,
			body: { code: 'RELATION_RESTRICTED' },
		})
		expect(await api('GET', '/authors/unknown')).toMatchObject({
			status: 404,
			body: { code: 'NOT_FOUND' },
		})
	})
})

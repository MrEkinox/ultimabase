// Each test runs the application on a new in-memory database and a free port.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)

it('lists the posts over GraphQL', async () => {
	await Post.create({ data: { title: 'Hello' } }, { as: master })
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ posts { edges { node { title } } } }' }),
	})
	expect(await response.json()).toEqual({
		data: { posts: { edges: [{ node: { title: 'Hello' } }] } },
	})
})

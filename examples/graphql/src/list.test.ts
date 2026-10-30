// Lists with take and skip, at the root and on a relation.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { listApp } from './list.ts'

const running = testApplication(listApp)

/** A GraphQL request's response body. */
const request = async (query: string): Promise<unknown> => {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	return response.json()
}

it('reads take and skip instead of connections', async () => {
	//#region read
	await request(`mutation {
		createPerson(data: { name: "Ada", posts: { create: [
			{ title: "Notes", slug: "notes" }, { title: "Plans", slug: "plans" }
		] } }) { id }
	}`)
	const body = await request(`{
		posts(take: 1, skip: 1, orderBy: [{ title: asc }]) {
			title author { name posts(take: 5) { slug } }
		}
	}`)
	expect(body).toEqual({
		data: {
			posts: [
				{
					title: 'Plans',
					author: {
						name: 'Ada',
						posts: [{ slug: 'notes' }, { slug: 'plans' }],
					},
				},
			],
		},
	})
	//#endregion
})

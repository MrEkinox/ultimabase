// Lists with take and skip, at the root and on a relation.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { listApp } from './list.ts'

const running = testApplication(listApp)

/** A REST response's JSON body. */
const request = async (path: string, body?: object): Promise<unknown> => {
	const response = await fetch(`${running.url}/api${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { 'content-type': 'application/json' },
		...(body !== undefined && { body: JSON.stringify(body) }),
	})
	return response.json()
}

it('reads take and skip instead of connections', async () => {
	//#region read
	await request('/people', {
		name: 'Ada',
		posts: {
			create: [
				{ title: 'Notes', slug: 'notes' },
				{ title: 'Plans', slug: 'plans' },
			],
		},
	})
	const select = JSON.stringify({
		title: true,
		author: {
			select: { name: true, posts: { take: 5, select: { slug: true } } },
		},
	})
	const orderBy = JSON.stringify({ title: 'asc' })
	const body = await request(
		`/posts?take=1&skip=1&orderBy=${orderBy}&select=${encodeURIComponent(select)}`,
	)
	expect(body).toEqual([
		{
			title: 'Plans',
			author: { name: 'Ada', posts: [{ slug: 'notes' }, { slug: 'plans' }] },
		},
	])
	//#endregion
})

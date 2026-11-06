// Lists with take and skip, at the root and on a relation.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { listApp } from './list.ts'

const running = testApplication(listApp)
const { check } = requestFiles(new URL('requests/', import.meta.url), running)

it('reads take and skip instead of connections', async () => {
	const created = await fetch(`${running.url}/api/people`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			name: 'Ada',
			posts: {
				create: [
					{ title: 'Notes', slug: 'notes' },
					{ title: 'Plans', slug: 'plans' },
				],
			},
		}),
	})
	expect(created.status).toBe(201)
	await check('list', {}, { status: 200 })
})

// `pagination: 'list'` (D-107): lists with `take` and `skip`, at every depth.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { post, seeded, started } from './test/app.ts'

let running: Awaited<ReturnType<typeof started>>
beforeAll(async () => {
	running = await started({ pagination: 'list', path: '/api' })
	await seeded()
})
afterAll(async () => running.app.stop())

it('reads take and skip, at the root and on a relation', async () => {
	const result = await post(
		`${running.url}/api`,
		`{ users(take: 1, skip: 1, orderBy: [{ name: asc }]) {
			name posts(take: 1) { title }
		} }`,
	)
	expect(result).toStrictEqual({
		data: { users: [{ name: 'bob', posts: [{ title: 'four' }] }] },
	})
})

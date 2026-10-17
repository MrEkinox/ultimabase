import { testApplication } from '@ultimabase/testing'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { expect, it, vi } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('seeds with Master authority and reads over HTTP', async () => {
	await using t = await testApplication(ultimabase)

	//#region handle
	const post = await t.asMaster(() =>
		Post.createOne({ data: { title: 'Seeded' } }),
	)
	const response = await t.fetch('/api/classes/Post')
	await t.afterCommit()
	//#endregion handle

	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ results: [{ id: post.id }] })

	await t.reset()

	expect(await Post.count()).toBe(0)
})

it('waits for after-commit work of the active application', async () => {
	await using t = await testApplication(ultimabase)
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

	await Post.createOne({ data: { title: 'Ship' } })
	await waitForAfterCommit()
	expect(info).toHaveBeenCalledWith('[audit] Post create-one')

	info.mockRestore()
	await t.reset()
})

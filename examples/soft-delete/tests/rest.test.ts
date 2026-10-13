import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// The requests the documentation shows with curl, sent in memory.
const postJson = (body: unknown) =>
	({
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	}) satisfies RequestInit

it('soft-deletes and restores a post over REST', async () => {
	await using t = await testApplication(ultimabase)
	const created = await t.fetch(
		'/api/classes/Post?select=id,title,isDeleted',
		postJson({ title: 'Draft announcement' }),
	)
	expect(created.status).toBe(201)
	expect(await created.json()).toMatchObject({
		result: { isDeleted: false, title: 'Draft announcement' },
	})
	const result = await Post.findOneOrThrow({ select: { title: true } })

	const deleted = await t.fetch(
		`/api/classes/Post/${result.id}/soft-delete-one`,
		postJson({ select: { title: true, isDeleted: true } }),
	)
	expect(deleted.status).toBe(200)
	expect(await deleted.json()).toStrictEqual({
		result: { id: result.id, isDeleted: true, title: 'Draft announcement' },
	})

	// The ordinary get route and a repeated soft deletion both answer 404.
	expect((await t.fetch(`/api/classes/Post/${result.id}`)).status).toBe(404)
	const again = await t.fetch(
		`/api/classes/Post/${result.id}/soft-delete-one`,
		postJson({}),
	)
	expect(again.status).toBe(404)

	const restored = await t.fetch(
		`/api/classes/Post/${result.id}/restore-one`,
		postJson({}),
	)
	expect(restored.status).toBe(200)
	expect(await Post.count()).toBe(1)
})

it('exposes no purge or many-row route', async () => {
	await using t = await testApplication(ultimabase)
	const { id } = await Post.createOne({ data: { title: 'Kept' } })
	for (const command of ['purge-one', 'soft-delete-many']) {
		const response = await t.fetch(
			`/api/classes/Post/${id}/${command}`,
			postJson({}),
		)
		expect(response.status).toBeGreaterThanOrEqual(404)
	}
})

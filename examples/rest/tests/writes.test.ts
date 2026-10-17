import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Feedback, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { anyString, seedBlog, stringAt } from './support.ts'

// Writes run the same schema commands, rules and transaction as TypeScript.
const json = { 'content-type': 'application/json' }
const id = anyString
const timestamps = {
	createdAt: anyString,
	updatedAt: anyString,
}

it('creates, updates and deletes a post with its links', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, guides, news } = await t.asMaster(seedBlog)

	//#region create-post
	const created = await t.fetch('/api/classes/Post?include=tags', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			title: 'Release notes',
			slug: 'release-notes',
			author: { connect: ada.id },
			tags: { connect: [news.id] },
		}),
	})
	//#endregion create-post

	// Without `?select`, a write answers `{ id }`; `include` adds the tags.
	expect(created.status).toBe(201)
	expect(await created.clone().json()).toStrictEqual({
		result: {
			id,
			tags: [{ id: news.id, name: 'news', ...timestamps }],
		},
	})
	const postId = await stringAt(created, 'result', 'id')

	//#region update-post
	const updated = await t.fetch(
		`/api/classes/Post/${postId}?select=views,author&include=tags`,
		{
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				views: { increment: 1 },
				author: null,
				tags: { connect: [guides.id], disconnect: [news.id] },
			}),
		},
	)
	//#endregion update-post

	expect(updated.status).toBe(200)
	expect(await updated.json()).toStrictEqual({
		result: {
			id: postId,
			views: 1,
			author: null,
			tags: [{ id: guides.id, name: 'guides', ...timestamps }],
		},
	})

	//#region delete-post
	const deleted = await t.fetch(`/api/classes/Post/${postId}?select=title`, {
		method: 'DELETE',
	})
	//#endregion delete-post

	// The answer is the row as it was before the delete.
	expect(deleted.status).toBe(200)
	expect(await deleted.json()).toStrictEqual({
		result: { id: postId, title: 'Release notes' },
	})
	expect((await t.fetch(`/api/classes/Post/${postId}`)).status).toBe(404)
})

it('creates posts in one atomic bulk request', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	//#region bulk-create
	const bulk = await t.fetch('/api/classes/Post/bulk/create', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			data: [
				{ title: 'Part 1', slug: 'part-1' },
				{ title: 'Part 2', slug: 'part-2' },
			],
			select: { slug: true },
		}),
	})
	//#endregion bulk-create

	expect(bulk.status).toBe(201)
	expect(await bulk.json()).toStrictEqual({
		results: [
			{ id, slug: 'part-1' },
			{ id, slug: 'part-2' },
		],
	})

	// One failing item fails the whole request: nothing is written.
	const conflict = await t.fetch('/api/classes/Post/bulk/create', {
		body: JSON.stringify({
			data: [
				{ title: 'Part 3', slug: 'part-3' },
				{ title: 'Again', slug: 'part-1' },
			],
		}),
		headers: json,
		method: 'POST',
	})
	expect(conflict.status).toBe(409)
	expect(await t.asMaster(() => Post.count())).toBe(7)
})

it('returns only the id of a row the caller cannot read', async () => {
	await using t = await testApplication(ultimabase)

	//#region write-only
	const sent = await t.fetch('/api/classes/Feedback', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ message: 'Lovely blog' }),
	})
	//#endregion write-only

	expect(sent.status).toBe(201)
	expect(await sent.json()).toStrictEqual({ result: { id } })

	// Asking for more fails and writes nothing.
	const denied = await t.fetch('/api/classes/Feedback?select=message', {
		body: JSON.stringify({ message: 'Lovely blog' }),
		headers: json,
		method: 'POST',
	})
	expect(denied.status).toBe(403)
	expect(await denied.json()).toMatchObject({
		error: { code: 'PERMISSION_DENIED' },
	})
	expect(await t.asMaster(() => Feedback.count())).toBe(1)
	// Reading feedback back is not permitted at all.
	expect((await t.fetch('/api/classes/Feedback')).status).toBe(403)
})

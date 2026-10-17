import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { anyString, seedBlog, stringAt } from './support.ts'

// Reads sent in memory with `t.fetch`, as a client would send them.
const id = anyString

it('lists, filters and pages through posts', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	//#region list-posts
	const page = await t.fetch(
		'/api/classes/Post?select=title,views&orderBy=-views&take=2',
	)
	//#endregion list-posts

	expect(page.status).toBe(200)
	expect(page.headers.get('x-ultimabase-rest-version')).toBe('1')
	expect(await page.clone().json()).toStrictEqual({
		results: [
			{ id, title: 'Hello', views: 42 },
			{ id, title: 'Alpha', views: 30 },
		],
		nextCursor: anyString,
	})
	const nextCursor = await stringAt(page, 'nextCursor')

	//#region next-page
	const next = await t.fetch(
		`/api/classes/Post?select=title,views&orderBy=-views&take=2&after=${nextCursor}`,
	)
	//#endregion next-page

	expect(await next.json()).toStrictEqual({
		results: [
			{ id, title: 'Gamma', views: 12 },
			{ id, title: 'Beta', views: 5 },
		],
		nextCursor: anyString,
	})

	//#region where-get
	const where = encodeURIComponent(JSON.stringify({ views: { gte: 10 } }))
	const popular = await t.fetch(
		`/api/classes/Post?where=${where}&select=title&orderBy=title`,
	)
	//#endregion where-get

	expect(await popular.json()).toStrictEqual({
		results: [
			{ id, title: 'Alpha' },
			{ id, title: 'Gamma' },
			{ id, title: 'Hello' },
		],
		nextCursor: null,
	})

	//#region query-post
	const query = await t.fetch('/api/classes/Post/query', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			where: { OR: [{ title: 'Beta' }, { views: { lt: 1 } }] },
			select: { title: true },
			orderBy: { title: 'asc' },
		}),
	})
	//#endregion query-post

	expect(await query.json()).toStrictEqual({
		results: [
			{ id, title: 'Beta' },
			{ id, title: 'Delta' },
		],
		nextCursor: null,
	})
})

it('uses the configured page size', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(() =>
		Post.createMany({
			data: Array.from({ length: 25 }, (_, index) => ({
				slug: `post-${String(index)}`,
				title: `Post ${String(index)}`,
			})),
		}),
	)

	// `pagination: { defaultTake: 20, maxTake: 100 }`
	const page = await t.fetch('/api/classes/Post?select=id')
	expect(await page.json()).toStrictEqual({
		results: Array.from({ length: 20 }, () => ({ id })),
		nextCursor: anyString,
	})
	// With `skip`, a page has no cursor.
	const skipped = await t.fetch('/api/classes/Post?select=id&skip=20')
	expect(await skipped.json()).toStrictEqual({
		results: [{ id }, { id }, { id }, { id }, { id }],
	})
})

it('reads one post with its author and tags', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, hello, news } = await t.asMaster(seedBlog)

	//#region read-post
	const post = await t.fetch(
		`/api/classes/Post/${hello.id}?select=title&include=author,tags`,
	)
	//#endregion read-post

	expect(await post.json()).toStrictEqual({
		result: {
			id: hello.id,
			title: 'Hello',
			author: {
				id: ada.id,
				name: 'Ada',
				createdAt: anyString,
				updatedAt: anyString,
			},
			tags: [
				{
					id: news.id,
					name: 'news',
					createdAt: anyString,
					updatedAt: anyString,
				},
			],
		},
	})

	// Without `include`, a pointer is its tagged identity.
	const pointer = await t.fetch(`/api/classes/Post/${hello.id}?select=author`)

	expect(await pointer.json()).toStrictEqual({
		result: {
			id: hello.id,
			author: { type: 'pointer', className: 'Author', id: ada.id },
		},
	})
})

it('answers first, count and exists', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)
	const where = encodeURIComponent(JSON.stringify({ title: 'Omega' }))

	//#region first-count-exists
	const first = await t.fetch(`/api/classes/Post/first?where=${where}`)
	const count = await t.fetch('/api/classes/Post/count')
	const exists = await t.fetch(`/api/classes/Post/exists?where=${where}`)
	//#endregion first-count-exists

	expect(await first.json()).toStrictEqual({ result: null })
	expect(await count.json()).toStrictEqual({ count: 5 })
	expect(await exists.json()).toStrictEqual({ exists: false })
})

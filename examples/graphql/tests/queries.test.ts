import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { readingService } from '../src/reading-service.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { anyString, postQuery, seedBlog, stringAt } from './support.ts'

// Queries POSTed in memory with `t.fetch`, as a client would send them.

it('pages through posts with first and after', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	//#region first-page
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				query FirstPosts {
					findManyPost(first: 2, orderBy: [{ field: views, direction: DESC }]) {
						totalCount
						nodes {
							title
							views
						}
						pageInfo {
							endCursor
							hasNextPage
						}
					}
				}
			`,
		}),
	})
	//#endregion first-page

	expect(response.status).toBe(200)
	//#region first-page-answer
	expect(await response.clone().json()).toStrictEqual({
		data: {
			findManyPost: {
				totalCount: 4,
				nodes: [
					{ title: 'Hello', views: 42 },
					{ title: 'Alpha', views: 30 },
				],
				pageInfo: { endCursor: anyString, hasNextPage: true },
			},
		},
	})
	//#endregion first-page-answer
	const endCursor = await stringAt(
		response,
		'data',
		'findManyPost',
		'pageInfo',
		'endCursor',
	)

	//#region next-page
	const next = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				query NextPosts($after: String) {
					findManyPost(
						first: 2
						after: $after
						orderBy: [{ field: views, direction: DESC }]
					) {
						nodes {
							title
						}
						pageInfo {
							hasNextPage
							hasPreviousPage
						}
					}
				}
			`,
			variables: { after: endCursor },
		}),
	})
	//#endregion next-page

	expect(await next.json()).toStrictEqual({
		data: {
			findManyPost: {
				nodes: [{ title: 'Gamma' }, { title: 'Beta' }],
				pageInfo: { hasNextPage: false, hasPreviousPage: true },
			},
		},
	})
})

it('filters with the operators the database declares', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	//#region where
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				{
					findManyPost(
						where: { views: { gte: 10 }, status: { eq: published } }
						orderBy: [{ field: title, direction: ASC }]
					) {
						nodes {
							title
						}
					}
					countPost(where: { title: { startsWith: "G" } })
					existsPost(where: { views: { gt: 100 } })
				}
			`,
		}),
	})
	//#endregion where

	expect(await response.json()).toStrictEqual({
		data: {
			findManyPost: {
				nodes: [{ title: 'Alpha' }, { title: 'Gamma' }, { title: 'Hello' }],
			},
			countPost: 1,
			existsPost: false,
		},
	})
})

it('reads relations and virtual fields in one request', async () => {
	await using t = await testApplication(ultimabase)
	const { ada, hello } = await t.asMaster(seedBlog)
	readingService.calls = 0

	//#region relations
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				{
					findManyPost(orderBy: [{ field: title, direction: ASC }]) {
						nodes {
							title
							readingMinutes
							author {
								name
							}
							comments(first: 1, orderBy: [{ field: body, direction: DESC }]) {
								nodes {
									body
								}
								pageInfo {
									hasNextPage
								}
							}
						}
					}
				}
			`,
		}),
	})
	//#endregion relations

	const empty = { nodes: [], pageInfo: { hasNextPage: false } }
	expect(await response.json()).toStrictEqual({
		data: {
			findManyPost: {
				nodes: [
					{ title: 'Alpha', readingMinutes: 1, author: null, comments: empty },
					{ title: 'Beta', readingMinutes: 1, author: null, comments: empty },
					{ title: 'Gamma', readingMinutes: 1, author: null, comments: empty },
					{
						title: 'Hello',
						readingMinutes: 1,
						author: { name: 'Ada' },
						comments: {
							nodes: [{ body: 'Second' }],
							pageInfo: { hasNextPage: true },
						},
					},
				],
			},
		},
	})
	// `resolveMany` estimated the four posts in one call.
	expect(readingService.calls).toBe(1)

	//#region get-post
	const post = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				query Post($id: ID!) {
					getPost(id: $id) {
						id
						title
						author {
							id
						}
					}
				}
			`,
			variables: { id: hello.id },
		}),
	})
	//#endregion get-post

	expect(await post.json()).toStrictEqual({
		data: {
			getPost: { id: hello.id, title: 'Hello', author: { id: ada.id } },
		},
	})
	// A missing target is a NOT_FOUND error beside `getPost: null`.
	const missing = await postQuery(
		t,
		'{ getPost(id: "0199b4f0-5a31-7000-8000-000000000001") { id } }',
	)
	expect(await missing.json()).toMatchObject({
		data: { getPost: null },
		errors: [{ extensions: { code: 'NOT_FOUND' }, path: ['getPost'] }],
	})
})

it('answers health and the custom schema field', async () => {
	await using t = await testApplication(ultimabase)

	//#region version
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ health version }' }),
	})
	//#endregion version

	expect(await response.json()).toStrictEqual({
		data: { health: 'OK', version: '1.0.0' },
	})
})

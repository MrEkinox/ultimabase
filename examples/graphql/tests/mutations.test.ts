import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Feedback, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { anyString, seedBlog, stringAt } from './support.ts'

// Mutations POSTed in memory with `t.fetch`; Access decides who may write.
const id = anyString

it('creates a post with nested links, then updates and deletes it', async () => {
	await using t = await testApplication(ultimabase)
	const { ada } = await t.asMaster(seedBlog)

	//#region create-post
	const created = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation CreatePost($authorId: ID!) {
					createPost(
						input: {
							title: "Hello again"
							author: { connect: $authorId }
							comments: { create: [{ body: "First" }] }
						}
					) {
						id
						title
						status
						author {
							name
						}
						comments(first: 10) {
							nodes {
								body
							}
						}
					}
				}
			`,
			variables: { authorId: ada.id },
		}),
	})
	//#endregion create-post

	expect(await created.clone().json()).toStrictEqual({
		data: {
			createPost: {
				id,
				title: 'Hello again',
				status: 'draft',
				author: { name: 'Ada' },
				comments: { nodes: [{ body: 'First' }] },
			},
		},
	})
	const postId = await stringAt(created, 'data', 'createPost', 'id')

	//#region update-post
	const updated = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation Publish($id: ID!) {
					updatePost(
						input: {
							where: { id: { eq: $id } }
							data: { status: { set: published }, views: { increment: 1 } }
						}
					) {
						status
						views
					}
				}
			`,
			variables: { id: postId },
		}),
	})
	//#endregion update-post

	expect(await updated.json()).toStrictEqual({
		data: { updatePost: { status: 'published', views: 1 } },
	})

	//#region delete-post
	const deleted = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation Delete($id: ID!) {
					deletePost(input: { where: { id: { eq: $id } } }) {
						id
						title
					}
				}
			`,
			variables: { id: postId },
		}),
	})
	//#endregion delete-post

	// The answer is the deleted row as it was.
	expect(await deleted.json()).toStrictEqual({
		data: { deletePost: { id: postId, title: 'Hello again' } },
	})
	expect(await t.asMaster(() => Post.exists({ where: { id: postId } }))).toBe(
		false,
	)
})

it('answers with the id alone for a row the caller cannot read', async () => {
	await using t = await testApplication(ultimabase)

	//#region write-only
	const sent = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation {
					createFeedback(input: { message: "Great post" }) {
						id
					}
				}
			`,
		}),
	})
	//#endregion write-only

	expect(await sent.json()).toStrictEqual({
		data: { createFeedback: { id } },
	})

	// Selecting more than `id` is denied, and nothing is written.
	const denied = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query:
				'mutation { createFeedback(input: { message: "Again" }) { id message } }',
		}),
	})
	expect(await denied.json()).toStrictEqual({
		data: null,
		errors: [
			{
				message:
					'The Feedback result is not readable by the caller: request select: { id: true } or review the Feedback read rule.',
				locations: [{ line: 1, column: 12 }],
				path: ['createFeedback'],
				extensions: {
					code: 'PERMISSION_DENIED',
					requestId: anyString,
					retryable: false,
				},
			},
		],
	})
	expect(await t.asMaster(() => Feedback.count())).toBe(1)
})

it('exposes a mutation without granting it', async () => {
	await using t = await testApplication(ultimabase)
	const feedback = await t.asMaster(() =>
		Feedback.createOne({ data: { message: 'Typo' } }),
	)

	//#region exposed-not-granted
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation Delete($id: ID!) {
					deleteFeedback(input: { where: { id: { eq: $id } } }) {
						id
					}
				}
			`,
			variables: { id: feedback.id },
		}),
	})
	//#endregion exposed-not-granted

	expect(response.status).toBe(200)
	// `deleteFeedback` returns a nullable row: `data` keeps the field.
	expect(await response.json()).toStrictEqual({
		data: { deleteFeedback: null },
		errors: [
			{
				message: 'The operation is not permitted.',
				locations: [{ line: 3, column: 6 }],
				path: ['deleteFeedback'],
				extensions: {
					code: 'PERMISSION_DENIED',
					requestId: anyString,
					retryable: false,
				},
			},
		],
	})
	expect(await t.asMaster(() => Feedback.count())).toBe(1)
})

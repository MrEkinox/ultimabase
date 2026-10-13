import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { anyString, postQuery, seedBlog } from './support.ts'

// A GraphQL answer can be `200` with `errors`: read `errors` as well as
// `data`. Each error carries a safe `extensions.code`, `requestId` and
// `retryable`, plus approved `details`.
const requestId = anyString

it('names the rule that enables a missing field', async () => {
	await using t = await testApplication(ultimabase)

	//#region disabled-field
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: 'mutation { createAuthor(input: { name: "Grace" }) { id } }',
		}),
	})
	//#endregion disabled-field

	// The document fails validation before any resolver runs.
	expect(response.status).toBe(400)
	//#region disabled-field-answer
	expect(await response.json()).toStrictEqual({
		errors: [
			{
				message:
					'Cannot query field "createAuthor" on type "Mutation". hint: enable graphql: { createOne: true } on Author',
				locations: [{ line: 1, column: 12 }],
				extensions: {
					code: 'GRAPHQL_VALIDATION_FAILED',
					requestId,
					retryable: false,
				},
			},
		],
	})
	//#endregion disabled-field-answer

	// `graphql: false`: no root field or mutation for AuditEntry.
	const audit = await postQuery(t, '{ findManyAuditEntry { nodes { id } } }')
	expect(audit.status).toBe(400)
	expect(await audit.json()).toMatchObject({
		errors: [
			{
				message:
					'Cannot query field "findManyAuditEntry" on type "Query". hint: enable graphql: { findMany: true } on AuditEntry',
			},
		],
	})
})

it('never reveals a field the caller may not read', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	// Selecting, filtering or sorting by `reviewNote` is denied, not answered.
	for (const query of [
		'{ findManyPost { nodes { reviewNote } } }',
		'{ findManyPost(where: { reviewNote: { eq: "x" } }) { nodes { id } } }',
		'{ findManyPost(orderBy: [{ field: reviewNote, direction: ASC }]) { nodes { id } } }',
	]) {
		const denied = await postQuery(t, query)
		expect(denied.status).toBe(200)
		expect(await denied.json()).toStrictEqual({
			data: null,
			errors: [
				{
					message: 'The operation is not permitted.',
					locations: [{ line: 1, column: 3 }],
					path: ['findManyPost'],
					extensions: {
						code: 'PERMISSION_DENIED',
						requestId,
						retryable: false,
					},
				},
			],
		})
	}
	// Writing it is denied too, and nothing is created.
	const written = await postQuery(
		t,
		'mutation { createPost(input: { title: "Leak", reviewNote: "x" }) { id } }',
	)
	expect(await written.json()).toMatchObject({
		errors: [{ extensions: { code: 'PERMISSION_DENIED' } }],
	})
})

it('rejects a cursor that does not match the read', async () => {
	await using t = await testApplication(ultimabase)

	//#region bad-cursor
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: '{ findManyPost(after: "not-a-cursor") { nodes { id } } }',
		}),
	})
	//#endregion bad-cursor

	expect(await response.json()).toStrictEqual({
		data: null,
		errors: [
			{
				message: 'The after position is invalid.',
				locations: [{ line: 1, column: 3 }],
				path: ['findManyPost'],
				extensions: {
					code: 'VALIDATION_ERROR',
					details: { parameter: 'after' },
					requestId,
					retryable: false,
				},
			},
		],
	})
})

it('keeps the HTTP envelope for failures before GraphQL', async () => {
	await using t = await testApplication(ultimabase)

	// `http: { appId: 'blog' }`: another application ID is unknown.
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-ultimabase-application-id': 'shop',
		},
		body: JSON.stringify({ query: '{ health }' }),
	})
	expect(response.status).toBe(404)
	expect(await response.json()).toStrictEqual({
		error: {
			code: 'HTTP_APPLICATION_UNKNOWN',
			message: 'The HTTP application is unknown.',
			requestId,
			retryable: false,
		},
	})
	// Yoga answers POST only.
	const get = await t.fetch('/graphql?query={health}')
	expect(get.status).toBe(405)
	expect(await get.json()).toMatchObject({
		errors: [{ extensions: { code: 'METHOD_NOT_ALLOWED' } }],
	})
})

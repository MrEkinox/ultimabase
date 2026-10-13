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

it('rejects a first outside the page window and a repeated order', async () => {
	await using t = await testApplication(ultimabase)

	//#region first-too-large
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: '{ findManyPost(first: 500) { nodes { id } } }',
		}),
	})
	//#endregion first-too-large

	expect(response.status).toBe(200)
	//#region first-too-large-answer
	expect(await response.json()).toStrictEqual({
		data: null,
		errors: [
			{
				message: 'The first argument must be an integer from 0 to 100.',
				locations: [{ line: 1, column: 3 }],
				path: ['findManyPost'],
				extensions: {
					code: 'VALIDATION_ERROR',
					details: { parameter: 'first' },
					requestId,
					retryable: false,
				},
			},
		],
	})
	//#endregion first-too-large-answer

	// A negative `first`, here inside a relation connection, fails the same way.
	const negative = await postQuery(
		t,
		'{ findManyPost { nodes { comments(first: -1) { nodes { id } } } } }',
	)
	expect(await negative.json()).toMatchObject({
		errors: [
			{
				message: 'The first argument must be an integer from 0 to 100.',
				extensions: {
					code: 'VALIDATION_ERROR',
					details: { parameter: 'first' },
				},
			},
		],
	})
	// An `orderBy` naming one field twice fails before any read.
	const repeated = await postQuery(
		t,
		'{ findManyPost(orderBy: [{ field: views, direction: ASC }, { field: views, direction: DESC }]) { nodes { id } } }',
	)
	expect(await repeated.json()).toMatchObject({
		errors: [
			{
				message: 'The orderBy argument repeats the field views.',
				extensions: {
					code: 'VALIDATION_ERROR',
					details: { parameter: 'orderBy' },
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

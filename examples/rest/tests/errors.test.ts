import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { anyString, seedBlog, stringAt } from './support.ts'

// Every REST failure is `{ error: { code, message, retryable, requestId,
// details? } }` with an HTTP status chosen by its cause.
const json = { 'content-type': 'application/json' }
const requestId = anyString
const missingId = '0199b4f0-5a31-7000-8000-000000000001'

it('locates a malformed request in its details', async () => {
	await using t = await testApplication(ultimabase)

	//#region bad-filter
	const where = encodeURIComponent(JSON.stringify({ views: { gt: 'many' } }))
	const response = await t.fetch(`/api/classes/Post?where=${where}`)
	//#endregion bad-filter

	expect(response.status).toBe(400)
	expect(await response.clone().json()).toStrictEqual({
		error: {
			code: 'REST_READ_INVALID_INPUT',
			message: 'The REST read request is malformed.',
			retryable: false,
			requestId,
			details: {
				parameter: 'where',
				path: ['views', 'gt'],
				reason: 'must be a safe integer',
			},
		},
	})
	// The same identifier travels in a header, to quote when reporting.
	expect(response.headers.get('x-ultimabase-request-id')).toBe(
		await stringAt(response, 'error', 'requestId'),
	)

	// Unknown parameters are rejected rather than ignored.
	const unknown = await t.fetch('/api/classes/Post?limit=10')
	expect(unknown.status).toBe(400)
	expect(await unknown.json()).toMatchObject({
		error: { details: { parameter: 'limit' } },
	})
	const tooMany = await t.fetch('/api/classes/Post?take=500')
	expect(await tooMany.json()).toMatchObject({
		error: {
			code: 'REST_READ_INVALID_INPUT',
			details: { parameter: 'take', reason: 'must not exceed 100' },
		},
	})
	// A cursor cannot be combined with `skip`.
	const cursor = await t.fetch('/api/classes/Post?after=abc&skip=1')
	expect(cursor.status).toBe(422)
	expect(await cursor.json()).toMatchObject({
		error: { code: 'VALIDATION_ERROR', details: { parameter: 'after' } },
	})
})

it('never reveals a field the caller may not read', async () => {
	await using t = await testApplication(ultimabase)
	const { hello } = await t.asMaster(seedBlog)

	const post = await t.fetch(`/api/classes/Post/${hello.id}`)
	expect(await post.json()).not.toHaveProperty('result.reviewNote')
	// Selecting, filtering or sorting by it is denied, not answered.
	const where = encodeURIComponent(JSON.stringify({ reviewNote: 'x' }))
	for (const query of [
		'select=reviewNote',
		`where=${where}`,
		'orderBy=reviewNote',
	]) {
		const denied = await t.fetch(`/api/classes/Post?${query}`)
		expect(denied.status).toBe(403)
		expect(await denied.json()).toMatchObject({
			error: { code: 'PERMISSION_DENIED' },
		})
	}
})

it('answers 404 for missing targets and unserved paths', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)

	const missing = await t.fetch(`/api/classes/Post/${missingId}`)
	expect(missing.status).toBe(404)
	expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })

	//#region missing-link
	const linked = await t.fetch('/api/classes/Post', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			title: 'Orphan',
			slug: 'orphan',
			author: { connect: missingId },
		}),
	})
	//#endregion missing-link

	expect(linked.status).toBe(404)
	expect(await linked.json()).toMatchObject({
		error: {
			code: 'NOT_FOUND',
			details: { field: 'author', schema: 'Author' },
		},
	})

	// `rest: false`: the schema has no route, and no answer reveals it.
	const tags = await t.fetch('/api/classes/Tag')
	expect(tags.status).toBe(404)
	expect(await tags.json()).toMatchObject({
		error: { code: 'REST_NOT_FOUND' },
	})
	// Outside REST's roots, the HTTP foundation answers.
	const outside = await t.fetch('/api/v1/classes/Post')
	expect(outside.status).toBe(404)
	expect(outside.headers.has('x-ultimabase-rest-version')).toBe(false)
	expect(await outside.json()).toMatchObject({
		error: { code: 'HTTP_NOT_FOUND' },
	})
})

it('answers 405 for a method the schema does not expose', async () => {
	await using t = await testApplication(ultimabase)

	//#region method-not-allowed
	const response = await t.fetch('/api/classes/Author', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Grace' }),
	})
	//#endregion method-not-allowed

	expect(response.status).toBe(405)
	expect(response.headers.get('allow')).toBe('GET')
	expect(await response.json()).toMatchObject({
		error: { code: 'REST_METHOD_NOT_ALLOWED' },
	})
	// Upsert is off by default on `Post`.
	const upsert = await t.fetch('/api/classes/Post/upsert', {
		body: JSON.stringify({}),
		headers: json,
		method: 'POST',
	})
	expect(upsert.status).toBe(405)
})

it('answers 409 for a conflict and 422 for invalid data', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(seedBlog)
	const create = (data: unknown) =>
		t.fetch('/api/classes/Post', {
			body: JSON.stringify(data),
			headers: json,
			method: 'POST',
		})

	const duplicate = await create({ title: 'Hello again', slug: 'hello' })
	expect(duplicate.status).toBe(409)
	expect(await duplicate.json()).toStrictEqual({
		error: {
			code: 'UNIQUE_VIOLATION',
			message: 'A Post with the same slug already exists.',
			retryable: false,
			requestId,
			details: { schema: 'Post', fields: ['slug'] },
		},
	})

	const invalid = await create({ slug: 'untitled', color: 'red' })
	expect(invalid.status).toBe(422)
	expect(await invalid.json()).toMatchObject({
		error: {
			code: 'VALIDATION_ERROR',
			details: {
				issues: [
					{ code: 'field.unknown', path: ['input', 'color'] },
					{ code: 'field.required', path: ['input', 'title'] },
				],
			},
		},
	})
})

it('keeps the HTTP envelope for failures before REST', async () => {
	await using t = await testApplication(ultimabase)

	// `httpPlugin({ appId: 'blog' })`: another application ID is unknown.
	const response = await t.fetch('/api/classes/Post', {
		headers: { 'x-ultimabase-application-id': 'shop' },
	})
	expect(response.status).toBe(404)
	expect(response.headers.has('x-ultimabase-rest-version')).toBe(false)
	expect(await response.json()).toMatchObject({
		error: { code: 'HTTP_APPLICATION_UNKNOWN' },
	})
})

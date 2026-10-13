import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'

it('calls an application operation', async () => {
	await using t = await testApplication(ultimabase)

	//#region call-operation
	const response = await t.fetch('/api/operations/readingTime', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ input: { text: 'Hello REST', wordsPerMinute: 1 } }),
	})
	//#endregion call-operation

	expect(response.status).toBe(200)
	expect(await response.json()).toStrictEqual({ result: { minutes: 2 } })

	// The `input` validator rejects an empty text: 422 with its issues.
	const invalid = await t.fetch('/api/operations/readingTime', {
		body: JSON.stringify({ input: { text: '' } }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	expect(invalid.status).toBe(422)
	expect(await invalid.json()).toMatchObject({
		error: {
			code: 'VALIDATION_ERROR',
			details: {
				issues: [{ code: 'operation.input', path: ['input', 'text'] }],
			},
		},
	})
	// The body is exactly `{ "input": value }`.
	const unwrapped = await t.fetch('/api/operations/readingTime', {
		body: JSON.stringify({ text: 'Hello REST' }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	expect(unwrapped.status).toBe(400)
	expect(await unwrapped.json()).toMatchObject({
		error: {
			code: 'REST_OPERATION_INVALID_INPUT',
			details: { parameter: 'body' },
		},
	})
})

it('describes the exposed routes in OpenAPI', async () => {
	await using t = await testApplication(ultimabase)

	//#region openapi
	const response = await t.fetch('/api/openapi.json')
	//#endregion openapi

	expect(response.status).toBe(200)
	const document: unknown = await response.json()
	expect(document).toMatchObject({
		openapi: '3.1.0',
		servers: [{ url: '/api' }],
		paths: {
			'/classes/Author': { get: { operationId: 'findManyAuthor' } },
			'/classes/Post/count': { get: { operationId: 'countPost' } },
			'/operations/readingTime': {
				post: {
					requestBody: {
						content: {
							'application/json': {
								schema: {
									properties: {
										input: {
											properties: {
												text: { type: 'string', minLength: 1 },
												wordsPerMinute: { default: 200, type: 'integer' },
											},
											required: ['text'],
										},
									},
								},
							},
						},
					},
				},
			},
		},
		components: {
			schemas: {
				PostCreateInput: { required: ['title', 'slug'] },
			},
		},
	})
	// Only exposed routes: no write on `Author`, nothing for `Tag`.
	expect(document).not.toHaveProperty(['paths', '/classes/Author', 'post'])
	expect(document).not.toHaveProperty(['paths', '/classes/Tag'])
})

import { testApplication, type TestApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { anyString, postQuery } from './support.ts'

const requestId = anyString

const call = (t: TestApplication, text: string) =>
	postQuery(
		t,
		'mutation Call($text: String!) { readingTime(input: { text: $text }) { minutes } }',
		{ text },
	)

it('calls an application operation as a mutation', async () => {
	await using t = await testApplication(ultimabase)

	//#region call-operation
	const response = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: /* GraphQL */ `
				mutation {
					readingTime(
						input: {
							text: "Hello GraphQL"
							pace: slow
							options: { wordsPerMinute: 1 }
						}
					) {
						minutes
						words
					}
				}
			`,
		}),
	})
	//#endregion call-operation

	expect(await response.json()).toStrictEqual({
		data: { readingTime: { minutes: 2, words: 2 } },
	})
})

it('reports invalid input and public errors', async () => {
	await using t = await testApplication(ultimabase)

	// The `input` validator rejects an empty text.
	const invalid = await call(t, '')
	expect(await invalid.json()).toStrictEqual({
		data: null,
		errors: [
			{
				message: 'The operation input is invalid.',
				locations: [{ line: 1, column: 33 }],
				path: ['readingTime'],
				extensions: {
					code: 'VALIDATION_ERROR',
					details: {
						issues: [
							{
								code: 'operation.input',
								message: 'Too small: expected string to have >=1 characters',
								path: ['input', 'text'],
							},
						],
					},
					requestId,
					retryable: false,
				},
			},
		],
	})

	//#region public-error
	const tooLong = await call(t, 'word '.repeat(10_001))
	//#endregion public-error

	expect(await tooLong.json()).toStrictEqual({
		data: null,
		errors: [
			{
				message: 'Split the text into chapters.',
				locations: [{ line: 1, column: 33 }],
				path: ['readingTime'],
				extensions: {
					code: 'TEXT_TOO_LONG',
					details: { words: 10_001 },
					requestId,
					retryable: false,
				},
			},
		],
	})
})

import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Event } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const postEvent = (body: unknown) =>
	({
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	}) satisfies RequestInit

// The request the documentation shows with curl, sent in memory.
it("answers 422 with Core's and the validators' issues together", async () => {
	await using t = await testApplication(ultimabase)
	const response = await t.fetch(
		'/api/classes/Event',
		postEvent({
			code: 'meetup',
			startsOn: '2026-11-02',
			endsOn: '2026-11-03',
			seatsLeft: 40,
		}),
	)

	expect(response.status).toBe(422)
	expect(await response.json()).toMatchObject({
		error: {
			code: 'VALIDATION_ERROR',
			details: {
				issues: [
					// Core's structural issue: the required title is missing.
					{
						code: 'field.required',
						message: 'Field is required',
						path: ['input', 'title'],
					},
					{
						code: 'event.code',
						message: 'Use three capital letters',
						path: ['input', 'code'],
					},
				],
			},
		},
	})
	expect(await Event.count()).toBe(0)
})

it('runs the schema check only on a structurally valid item', async () => {
	await using t = await testApplication(ultimabase)
	// The dates are inverted, but the missing title stops the schema check.
	const response = await t.fetch(
		'/api/classes/Event',
		postEvent({ startsOn: '2026-11-03', endsOn: '2026-11-02', seatsLeft: 40 }),
	)

	expect(response.status).toBe(422)
	expect(await response.json()).toMatchObject({
		error: {
			details: {
				issues: [{ code: 'field.required', path: ['input', 'title'] }],
			},
		},
	})
})

import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Event } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// The request the documentation shows with curl, sent in memory.
it("answers 422 with Core's and the validators' issues together", async () => {
	await using t = await testApplication(ultimabase)
	const response = await t.fetch('/api/classes/Event', {
		body: JSON.stringify({
			code: 'meetup',
			startsOn: '2026-11-02',
			endsOn: '2026-11-03',
			seatsLeft: 40,
		}),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})

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

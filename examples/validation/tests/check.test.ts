import { testApplication } from '@ultimabase/testing'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { expect, it } from 'vitest'

import { Event } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('checks data without writing it', async () => {
	await testApplication(ultimabase)
	//#region check
	const validation = ultimabase.plugin(validationPlugin)

	const accepted = await validation.check(Event, {
		data: {
			title: 'Autumn meetup',
			startsOn: '2026-11-02',
			endsOn: '2026-11-03',
			seatsLeft: 40,
		},
	})
	const rejected = await validation.check(Event, {
		data: {
			title: 'Autumn meetup',
			code: 'meetup',
			startsOn: '2026-11-03',
			endsOn: '2026-11-02',
			seatsLeft: 40,
		},
	})
	//#endregion check

	expect(accepted).toStrictEqual({ valid: true })
	expect(rejected).toStrictEqual({
		issues: [
			{
				code: 'event.code',
				message: 'Use three capital letters',
				path: ['input', 'code'],
			},
			{
				code: 'event.dates',
				message: 'An event cannot end before it starts',
				path: ['endsOn'],
			},
		],
		valid: false,
	})
	expect(await Event.count()).toBe(0)
})

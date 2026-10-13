import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Event } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the Validation documentation page; the
// assertions after it prove what the page says about the result.
const dates = { startsOn: '2026-11-02', endsOn: '2026-11-03' } as const

it('stores the output of a Standard Schema validator', async () => {
	await testApplication(ultimabase)
	//#region transform
	const event = await Event.createOne({
		data: { title: '  Autumn meetup  ', seatsLeft: 40, ...dates },
		select: { title: true },
	})
	//#endregion transform

	expect(event.title).toBe('Autumn meetup')
	expect(await Event.findOneOrThrow({ select: { title: true } })).toMatchObject(
		{ title: 'Autumn meetup' },
	)
})

it('reports every issue of a write in one VALIDATION_ERROR', async () => {
	await testApplication(ultimabase)
	//#region all-issues
	const attempt = Event.createOne({
		data: {
			title: 'Autumn meetup',
			code: 'meetup',
			room: 'Basement',
			summary: 'Short',
			startsOn: '2026-11-03',
			endsOn: '2026-11-02',
			seatsLeft: 40,
		},
	})
	//#endregion all-issues

	await expect(attempt).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'event.code',
					message: 'Use three capital letters',
					path: ['input', 'code'],
				},
				{
					code: 'field.validation',
					message: 'Basement is closed',
					path: ['input', 'room'],
				},
				{
					code: 'field.validation',
					message: 'Too small: expected string to have >=10 characters',
					path: ['input', 'summary'],
				},
				{
					code: 'event.dates',
					message: 'An event cannot end before it starts',
					path: ['endsOn'],
				},
			],
		},
	})
	// Nothing was written.
	expect(await Event.count()).toBe(0)
})

it('never runs a field validator for null', async () => {
	await testApplication(ultimabase)
	const event = await Event.createOne({
		data: {
			title: 'Autumn meetup',
			summary: 'Talks and demos',
			seatsLeft: 40,
			...dates,
		},
	})

	//#region null-input
	// `z.string().min(10)` would reject null; the validator does not run.
	const cleared = await Event.updateOne({
		where: { id: { eq: event.id } },
		data: { summary: null },
		select: { summary: true },
	})
	//#endregion null-input

	expect(cleared).toStrictEqual({ id: event.id, summary: null })
})

it('validates Master writes like any other', async () => {
	await using t = await testApplication(ultimabase)
	await expect(
		t.asMaster(() =>
			Event.createOne({
				data: { title: 'Launch', code: 'x', seatsLeft: 10, ...dates },
			}),
		),
	).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [{ code: 'event.code', path: ['input', 'code'] }],
		},
	})
})

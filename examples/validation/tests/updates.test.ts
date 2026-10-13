import { testApplication } from '@ultimabase/testing'
import { expect, it, onTestFinished } from 'vitest'

import { closeRoom, reopenRoom } from '../src/rooms.ts'
import { Event } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const createEvent = (title: string, seatsLeft = 40) =>
	Event.createOne({
		data: {
			title,
			room: 'Hall B',
			startsOn: '2026-11-02',
			endsOn: '2026-11-03',
			seatsLeft,
		},
	})

it('validates only the fields an update writes', async () => {
	await testApplication(ultimabase)
	const event = await createEvent('Autumn meetup')
	closeRoom('Hall B')
	onTestFinished(() => {
		reopenRoom('Hall B')
	})

	//#region changed-fields
	// The room has closed since the event was created. Renaming the event
	// does not run the room validator; writing the room again does.
	const renamed = await Event.updateOne({
		where: { id: { eq: event.id } },
		data: { title: 'Autumn meetup (full day)' },
		select: { title: true, room: true },
	})
	const moved = Event.updateOne({
		where: { id: { eq: event.id } },
		data: { room: 'Hall B' },
	})
	//#endregion changed-fields

	expect(renamed).toMatchObject({
		room: 'Hall B',
		title: 'Autumn meetup (full day)',
	})
	await expect(moved).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'field.validation',
					message: 'Hall B is closed',
					path: ['update', 0, 'room', 'value'],
				},
			],
		},
	})
})

it('runs the schema check on the complete updated item', async () => {
	await testApplication(ultimabase)
	const event = await createEvent('Autumn meetup')

	//#region update-check
	// Only `startsOn` changes; the check compares it with the stored `endsOn`.
	const postponed = Event.updateOne({
		where: { id: { eq: event.id } },
		data: { startsOn: '2026-11-05' },
	})
	//#endregion update-check

	await expect(postponed).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'event.dates',
					message: 'An event cannot end before it starts',
					path: ['endsOn'],
				},
			],
		},
	})
})

it('validates the projected value of an atomic decrement', async () => {
	await testApplication(ultimabase)
	const event = await createEvent('Workshop', 1)

	//#region book-seat
	const bookSeat = (id: string) =>
		Event.updateOne({
			where: { id: { eq: id } },
			// The database applies the decrement; the validator sees the result.
			data: { seatsLeft: { decrement: 1 } },
			select: { seatsLeft: true },
		})

	const booked = await bookSeat(event.id)
	const full = bookSeat(event.id)
	//#endregion book-seat

	expect(booked).toStrictEqual({ id: event.id, seatsLeft: 0 })
	await expect(full).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'event.full',
					message: 'No seats left',
					path: ['update', 0, 'seatsLeft', 'value'],
				},
			],
		},
	})
	expect(
		await Event.findOneOrThrow({ select: { seatsLeft: true } }),
	).toMatchObject({ seatsLeft: 0 })
})

it('prefixes updateMany issue paths with the target index', async () => {
	await testApplication(ultimabase)
	const first = await createEvent('First')
	const second = await createEvent('Second')

	//#region update-many
	const updates = Event.updateMany({
		data: [
			{ where: { id: { eq: first.id } }, data: { code: 'ABC' } },
			{ where: { id: { eq: second.id } }, data: { code: 'second' } },
		],
	})
	//#endregion update-many

	await expect(updates).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'event.code',
					message: 'Use three capital letters',
					path: [1, 'update', 0, 'code', 'value'],
				},
			],
		},
	})
	// The whole call failed: the first event kept its code.
	expect(
		await Event.findOneOrThrow({
			where: { id: { eq: first.id } },
			select: { code: true },
		}),
	).toMatchObject({ code: null })
})

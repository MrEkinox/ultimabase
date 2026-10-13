//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { z } from 'zod'

import { isRoomOpen } from './rooms.ts'

/**
 * The configured factory types the `validation` field option and the schema
 * check of `.with({ validation })`. Access opens the REST writes of this
 * example; Validation needs neither Access nor REST.
 */
export const App = UltimaBase.use(
	validationPlugin(),
	accessPlugin(),
	...apiServer({ http: { appId: 'events' }, rest: true }),
	postgresPlugin(),
)
//#endregion factory

//#region event
export const Event = App.Schema.define({
	className: 'Event',
	fields: (field) => ({
		// A Standard Schema validator's output is stored: trimmed, then checked.
		title: field.string({
			required: true,
			validation: z.string().trim().min(1).max(80),
		}),
		// A function validator returns true, a message, or { message, code }.
		code: field.string({
			validation: (code) =>
				/^[A-Z]{3}$/u.test(code) || {
					code: 'event.code',
					message: 'Use three capital letters',
				},
		}),
		// An async validator may ask another service; it runs in the transaction.
		room: field.string({
			validation: async (room) =>
				(await isRoomOpen(room)) || `${room} is closed`,
		}),
		// Optional: `null` clears the summary without running the validator.
		summary: field.string({ validation: z.string().min(10) }),
		startsOn: field.date({ required: true }),
		endsOn: field.date({ required: true }),
		// Bookings decrement this count; the projected value is validated.
		seatsLeft: field.int({
			required: true,
			validation: (seats) =>
				seats >= 0 || { code: 'event.full', message: 'No seats left' },
		}),
	}),
}).with({
	// Every caller may read, create and update events in this example.
	access: { read: true, create: true, update: true },
	// The schema check sees the complete event as it would be stored.
	validation: ({ item }) =>
		item.endsOn >= item.startsOn || {
			code: 'event.dates',
			message: 'An event cannot end before it starts',
			path: ['endsOn'],
		},
})
//#endregion event

//#region ticket-tier
/** A Standard Schema object validator checks the item; its output is not stored. */
export const TicketTier = App.Schema.define({
	className: 'TicketTier',
	fields: (field) => ({
		name: field.string({ required: true }),
		minPerOrder: field.int({ required: true }),
		maxPerOrder: field.int({ required: true }),
	}),
}).with({
	access: { read: true, create: true },
	validation: z
		.object({ minPerOrder: z.number().min(1), maxPerOrder: z.number() })
		.refine(({ maxPerOrder, minPerOrder }) => maxPerOrder >= minPerOrder, {
			message: 'The maximum cannot be below the minimum',
			path: ['maxPerOrder'],
		}),
})
//#endregion ticket-tier

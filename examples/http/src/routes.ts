import { PublicError } from '@ultimabase/core'
import type { HttpRouteRecord } from '@ultimabase/http-plugin'

import { partner } from './partners.ts'

/** One message of the contact form. */
export interface ContactMessage {
	readonly email: string
	readonly message: string
}

/**
 * Stands in for a ticketing system or a mailbox: the contact route files
 * each message here, and the tests read it.
 */
export const inbox: ContactMessage[] = []

const readContactMessage = (body: unknown): ContactMessage => {
	const email: unknown =
		typeof body === 'object' && body !== null
			? Reflect.get(body, 'email')
			: undefined
	const message: unknown =
		typeof body === 'object' && body !== null
			? Reflect.get(body, 'message')
			: undefined
	if (typeof email !== 'string' || !email.includes('@')) {
		throw new PublicError('Give an email address to reply to.', {
			code: 'CONTACT_INVALID',
			details: { field: 'email' },
		})
	}
	if (typeof message !== 'string' || message.trim() === '') {
		throw new PublicError('Write a message.', {
			code: 'CONTACT_INVALID',
			details: { field: 'message' },
		})
	}
	return { email, message }
}

//#region routes
/**
 * Application routes need no plugin. Each handler receives the Fetch request
 * and the request context, already active.
 */
export const routes = {
	'GET /status': (_request, { context }) =>
		Response.json({
			mode: context.access.mode,
			partner: context.getValue(partner)?.name ?? null,
		}),
	// A public form: small bodies, and five messages a minute per client.
	'POST /contact': {
		bodyLimit: 8_192,
		rateLimit: { perMinute: 5 },
		handle: async (request) => {
			// A PublicError answers 400 with its code, message and details.
			const contact = readContactMessage(await request.json())
			inbox.push(contact)
			return Response.json({ received: true }, { status: 202 })
		},
	},
} satisfies HttpRouteRecord
//#endregion routes

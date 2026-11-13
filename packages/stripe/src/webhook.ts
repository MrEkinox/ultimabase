// The webhook (D-371 point 4): thin events, verified on the raw body,
// stored once with their job in one transaction, then answered 200. The
// event only says what changed: its job reads Stripe.
import type { Routes } from '@ultimabase/http'
import { routes } from '@ultimabase/http'
import type { Stripe } from 'stripe'
import { PublicError, transaction } from 'ultimabase'
import { eventJob } from './jobs.ts'
import { M, StripeEvent } from './models.ts'
import { runningOf } from './running.ts'

/** A thin event, as the plugin stores it. */
interface ThinEvent {
	readonly id: string
	readonly type: string
	readonly livemode: boolean
	readonly objectType: string
	readonly objectId: string
}

const text = (from: unknown, key: string): string => {
	const value: unknown =
		typeof from === 'object' && from !== null
			? Reflect.get(from, key)
			: undefined
	return typeof value === 'string' ? value : ''
}

/** The verified event, or `undefined` for a wrong or stale signature. */
function verified(
	client: Stripe,
	payload: string,
	signature: string,
	secret: string,
): ThinEvent | undefined {
	let event: unknown
	try {
		event = client.parseEventNotification(payload, signature, secret)
	} catch {
		return undefined
	}
	const related: unknown = Reflect.get(Object(event), 'related_object')
	return {
		id: text(event, 'id'),
		// `v1.customer.subscription.updated`: the v1 type it stands for.
		type: text(event, 'type').replace(/^v1\./u, ''),
		livemode: Reflect.get(Object(event), 'livemode') === true,
		objectType: text(related, 'type'),
		objectId: text(related, 'id'),
	}
}

/** Stores the event and enqueues its job; one received twice is stored once. */
async function store(event: ThinEvent): Promise<void> {
	try {
		await transaction(async () => {
			const { livemode: _, id: stripeId, ...data } = event
			const { id } = await StripeEvent.create(
				{ data: { ...data, stripeId } },
				M,
			)
			await eventJob.enqueue({ event: id })
		})
	} catch (error) {
		if (error instanceof PublicError && error.code === 'UNIQUE_VIOLATION') {
			return
		}
		throw error
	}
}

/** The webhook's route, at `path`. */
export const webhookRoutes = (path: string): Routes =>
	routes().post(path, async (c) => {
		const { stripe, logger } = runningOf('The Stripe webhook')
		if (stripe === undefined) {
			const message = 'Payments are unavailable.'
			return c.json({ code: 'PAYMENT_UNAVAILABLE', message }, 503)
		}
		const signature = c.req.header('stripe-signature')
		// The raw body: the signature covers its exact bytes.
		const payload = await c.req.text()
		const event =
			signature === undefined
				? undefined
				: verified(stripe.client, payload, signature, stripe.webhook)
		if (event === undefined) {
			const message = 'The Stripe signature does not match.'
			return c.json({ code: 'UNAUTHENTICATED', message }, 401)
		}
		// Another mode's event: acknowledged, so that Stripe stops sending
		// it, and dropped.
		if (event.livemode !== stripe.live) {
			const details = { event: event.id, livemode: event.livemode }
			logger.warn(details, 'A Stripe event of the other mode was dropped.')
			return c.json({ received: false })
		}
		await store(event)
		return c.json({ received: true })
	})

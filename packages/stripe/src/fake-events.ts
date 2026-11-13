// The thin events of the fake account (D-371 point 8), as Stripe sends them
// to an event destination, signed with the webhook's secret.
import { Stripe } from 'stripe'

/** A thin event's body, as Stripe sends it to an event destination. */
export const thinEvent = (event: {
	readonly id?: string
	/** Its v1 type: `customer.subscription.updated`. */
	readonly type: string
	/** Its related object: `{ id: 'sub_1', type: 'subscription' }`. */
	readonly object: { readonly id: string; readonly type: string }
	readonly livemode?: boolean
}): string =>
	JSON.stringify({
		id: event.id ?? `evt_${crypto.randomUUID().replaceAll('-', '')}`,
		object: 'v2.core.event',
		type: `v1.${event.type}`,
		livemode: event.livemode ?? false,
		created: new Date().toISOString(),
		related_object: { ...event.object, url: `/v1/${event.object.id}` },
	})

/** Posts `payload` to the webhook of the application at `url`, signed. */
export const postEvent = async (
	url: string,
	payload: string,
	options: { readonly secret: string; readonly path?: string | undefined },
): Promise<Response> =>
	fetch(`${url}${options.path ?? '/webhooks/stripe'}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': Stripe.webhooks.generateTestHeaderString({
				payload,
				secret: options.secret,
			}),
		},
		body: payload,
	})

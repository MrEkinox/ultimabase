// What the plugin asks Stripe's API to set right what went wrong (D-375):
// a payer's second subscription ended and refunded, and the customers that
// Stripe's events changed, for the hourly job to find what a lost webhook
// missed.
import { Stripe } from 'stripe'
import type { RecoveryGateway } from './billing-gateway.ts'
import { all, guarded, ownerOf, refOf } from './sdk-billing.ts'

/** The statuses Stripe no longer changes. */
const ended = new Set(['canceled', 'incomplete_expired'])

/** Whether Stripe refused a refund the payment no longer needs. */
const refundedAlready = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeInvalidRequestError &&
	(error.code === 'charge_already_refunded' || error.code === 'charge_disputed')

async function cancelAndRefund(client: Stripe, id: string): Promise<void> {
	const subscription = await client.subscriptions.retrieve(id)
	if (!ended.has(subscription.status)) {
		await client.subscriptions.cancel(id, { prorate: false })
	}
	const invoice = refOf(subscription.latest_invoice)
	if (invoice === null) return
	const paid = await all(
		client.invoicePayments.list({ invoice, status: 'paid', limit: 100 }),
	)
	for (const { payment } of paid) {
		const intent = refOf(payment.payment_intent ?? null)
		const charge = refOf(payment.charge ?? null)
		const target =
			intent === null
				? charge === null
					? undefined
					: { charge }
				: { payment_intent: intent }
		if (target === undefined) continue
		try {
			// The key makes a retried job refund once.
			await client.refunds.create(target, {
				idempotencyKey: `refund-${intent ?? charge ?? ''}`,
			})
		} catch (error) {
			if (!refundedAlready(error)) throw error
		}
	}
}

/** The customer an event's object belongs to, from the event alone. */
async function ownerOfEvent(
	client: Stripe,
	event: Stripe.Event,
): Promise<string | null> {
	const object: unknown = event.data.object
	const kind: unknown = Reflect.get(Object(object), 'object')
	const id: unknown = Reflect.get(Object(object), 'id')
	if (kind === 'customer' && typeof id === 'string') return id
	const customer: unknown = Reflect.get(Object(object), 'customer')
	if (typeof customer === 'string') return customer
	const nested: unknown = Reflect.get(Object(customer), 'id')
	if (typeof nested === 'string') return nested
	// A dispute names its charge only.
	if (kind === 'dispute' && typeof id === 'string') {
		return refOf(await ownerOf(client, 'dispute', id))
	}
	return null
}

async function changedSince(
	client: Stripe,
	since: Date,
): Promise<ReadonlyMap<string, Date>> {
	const changed = new Map<string, Date>()
	const created = { gt: Math.floor(since.getTime() / 1000) }
	// Stripe lists its events for 30 days, the newest first.
	for await (const event of client.events.list({ created, limit: 100 })) {
		const customer = await ownerOfEvent(client, event)
		const at = new Date(event.created * 1000)
		const known = customer === null ? undefined : changed.get(customer)
		if (customer !== null && (known === undefined || known < at)) {
			changed.set(customer, at)
		}
	}
	return changed
}

/** The recovery gateway over Stripe's API. */
export const sdkRecovery = (client: Stripe): RecoveryGateway => ({
	cancelAndRefund: async (id) =>
		guarded(id, async () => cancelAndRefund(client, id)),
	changedSince: async (since) =>
		guarded('events', async () => changedSince(client, since)),
})

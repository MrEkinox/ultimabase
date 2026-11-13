// What a customer holds at Stripe, read for its sync: its subscriptions,
// the one-time payments the plugin opened, and its subscriptions' paid
// invoices.
import type { Stripe } from 'stripe'
import type {
	CustomerState,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { managedBy } from './gateway.ts'
import { all, dateOf, keysOf, maybeDate, refOf } from './sdk-common.ts'
import { invoicesOf } from './sdk-invoices.ts'

/** A subscription's next phase, when its schedule holds one. */
async function scheduledOf(
	client: Stripe,
	schedule: Stripe.Subscription['schedule'],
): Promise<StripeSubscription['scheduled']> {
	if (schedule === null || typeof schedule === 'string') return null
	const now = Date.now() / 1000
	const next = schedule.phases.find(({ start_date }) => start_date > now)
	const item = next?.items[0]
	if (next === undefined || item === undefined) return null
	const price =
		typeof item.price === 'string'
			? await client.prices.retrieve(item.price)
			: item.price
	return { ...keysOf(price), at: dateOf(next.start_date) }
}

async function subscriptionOf(
	client: Stripe,
	subscription: Stripe.Subscription,
): Promise<StripeSubscription> {
	const item = subscription.items.data[0]
	const quantity = item?.quantity ?? 1
	const recurring = item?.price.recurring
	const cancelAt =
		subscription.cancel_at ??
		(subscription.cancel_at_period_end
			? (item?.current_period_end ?? null)
			: null)
	return {
		id: subscription.id,
		customerId: refOf(subscription.customer) ?? '',
		...(item === undefined
			? { product: null, price: null }
			: keysOf(item.price)),
		status: subscription.status,
		quantity,
		amount: (item?.price.unit_amount ?? 0) * quantity,
		every: recurring?.interval ?? 'month',
		everyCount: recurring?.interval_count ?? 1,
		currentPeriodEnd: dateOf(
			item?.current_period_end ?? subscription.start_date,
		),
		cancelAt: maybeDate(cancelAt),
		canceledAt: maybeDate(subscription.canceled_at),
		trialEnd: maybeDate(subscription.trial_end),
		startedAt: dateOf(subscription.start_date),
		scheduled: await scheduledOf(client, subscription.schedule),
	}
}

/** The quantity a Checkout wrote to its payment, one when it wrote none. */
const quantityOf = (value: string | undefined): number => {
	const quantity = Number(value)
	return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1
}

async function paymentOf(
	client: Stripe,
	intent: Stripe.PaymentIntent,
): Promise<StripePayment> {
	const charge =
		intent.latest_charge === null || typeof intent.latest_charge === 'string'
			? null
			: intent.latest_charge
	const disputes =
		charge?.disputed === true
			? await all(client.disputes.list({ payment_intent: intent.id }))
			: []
	return {
		id: intent.id,
		customerId: refOf(intent.customer) ?? '',
		product: intent.metadata['product'] ?? null,
		quantity: quantityOf(intent.metadata['quantity']),
		amount: intent.amount_received,
		refunded: charge?.amount_refunded ?? 0,
		disputeLost: disputes.some(({ status }) => status === 'lost'),
		paidAt: dateOf(intent.created),
		receiptUrl: charge?.receipt_url ?? null,
	}
}

export const gone: CustomerState = {
	deleted: true,
	subscriptions: [],
	payments: [],
	invoices: [],
}

const day = 24 * 60 * 60

/** What a customer holds. */
export async function stateOf(
	client: Stripe,
	id: string,
	withInvoices: boolean,
): Promise<CustomerState> {
	const customer = await client.customers.retrieve(id)
	if (customer.deleted === true) return gone
	const [subscriptions, intents, invoices] = await Promise.all([
		all(
			client.subscriptions.list({
				customer: id,
				status: 'all',
				limit: 100,
				expand: ['data.schedule'],
			}),
		),
		all(
			client.paymentIntents.list({
				customer: id,
				limit: 100,
				expand: ['data.latest_charge'],
			}),
		),
		withInvoices
			? all(
					client.invoices.list({
						customer: id,
						status: 'paid',
						// A refund comes within the year; a paid period, within its own.
						created: { gte: Math.floor(Date.now() / 1000) - 400 * day },
						limit: 100,
						expand: ['data.payments'],
					}),
				)
			: [],
	])
	const succeeded = intents.filter(({ status }) => status === 'succeeded')
	const paid = await Promise.all(
		succeeded.map(async (one) => paymentOf(client, one)),
	)
	// The plugin's one-time payments; the others paid invoices.
	const opened = new Set(
		succeeded
			.filter(({ metadata }) => metadata['managedBy'] === managedBy)
			.map(({ id: intent }) => intent),
	)
	return {
		deleted: false,
		subscriptions: await Promise.all(
			subscriptions.map(async (one) => subscriptionOf(client, one)),
		),
		payments: paid.filter((one) => opened.has(one.id)),
		invoices: await invoicesOf(
			client,
			invoices,
			new Map(paid.map((one) => [one.id, one])),
		),
	}
}

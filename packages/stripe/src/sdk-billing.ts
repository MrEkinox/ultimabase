// The billing gateway over Stripe's API: what `gatewayOf` gives a real
// secret key. Stripe's errors become the plugin's: `PAYMENT_UNAVAILABLE`
// when Stripe cannot answer, `Missing` for an object it does not hold.
import { Stripe } from 'stripe'
import type {
	BillingGateway,
	CustomerProfile,
	CustomerState,
	PortalFlow,
	PriceKeys,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { Missing, unavailable } from './billing-gateway.ts'
import { managedBy } from './gateway.ts'

/** Stripe's errors, as the plugin's: unavailable, missing, or a bug. */
const translated = (error: unknown, id: string): unknown => {
	if (
		error instanceof Stripe.errors.StripeConnectionError ||
		error instanceof Stripe.errors.StripeAPIError ||
		error instanceof Stripe.errors.StripeRateLimitError
	) {
		return unavailable(error)
	}
	if (
		error instanceof Stripe.errors.StripeInvalidRequestError &&
		error.code === 'resource_missing'
	) {
		return new Missing(id)
	}
	return error
}

export const guarded = async <T>(
	id: string,
	run: () => Promise<T>,
): Promise<T> => {
	try {
		return await run()
	} catch (error) {
		throw translated(error, id)
	}
}

export const all = async <T>(list: AsyncIterable<T>): Promise<T[]> => {
	const items: T[] = []
	for await (const item of list) items.push(item)
	return items
}

export type Ref = string | { readonly id: string } | null
export const refOf = (value: Ref): string | null =>
	value === null || typeof value === 'string' ? value : value.id

const dateOf = (seconds: number): Date => new Date(seconds * 1000)
const maybeDate = (seconds: number | null): Date | null =>
	seconds === null ? null : dateOf(seconds)

const keysOf = (price: Stripe.Price | Stripe.DeletedPrice): PriceKeys =>
	'metadata' in price
		? {
				product: price.metadata['product'] ?? null,
				price: price.metadata['price'] ?? null,
			}
		: { product: null, price: null }

const profileParams = (profile: CustomerProfile) => ({
	...(profile.email != null && { email: profile.email }),
	...(profile.name != null && { name: profile.name }),
	...(profile.locale != null && { preferred_locales: [profile.locale] }),
})

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
		quantity: item?.quantity ?? 1,
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
		amount: intent.amount_received,
		refunded: charge?.amount_refunded ?? 0,
		disputeLost: disputes.some(({ status }) => status === 'lost'),
		paidAt: dateOf(intent.created),
	}
}

/** The customer an object belongs to, read from Stripe. */
export async function ownerOf(
	client: Stripe,
	type: string,
	id: string,
): Promise<Ref> {
	switch (type) {
		case 'customer':
			return id
		case 'checkout.session':
			return (await client.checkout.sessions.retrieve(id)).customer
		case 'subscription':
			return (await client.subscriptions.retrieve(id)).customer
		case 'subscription_schedule':
			return (await client.subscriptionSchedules.retrieve(id)).customer
		case 'invoice':
			return (await client.invoices.retrieve(id)).customer
		case 'payment_intent':
			return (await client.paymentIntents.retrieve(id)).customer
		case 'charge':
			return (await client.charges.retrieve(id)).customer
		case 'dispute': {
			const { charge } = await client.disputes.retrieve(id)
			const chargeId = refOf(charge)
			return chargeId === null
				? null
				: (await client.charges.retrieve(chargeId)).customer
		}
		default:
			return null
	}
}

/** The active price of a lookup key, or a bug: the catalog was not applied. */
async function priceId(client: Stripe, lookupKey: string): Promise<string> {
	const listed = await client.prices.list({
		lookup_keys: [lookupKey],
		active: true,
		limit: 1,
	})
	const [price] = listed.data
	if (price === undefined) {
		throw new Error(
			`Stripe holds no active price ${lookupKey}: apply the catalog.`,
		)
	}
	return price.id
}

async function flowOf(
	client: Stripe,
	flow: PortalFlow,
	returnUrl: string,
): Promise<Stripe.BillingPortal.SessionCreateParams.FlowData | undefined> {
	const after = {
		type: 'redirect' as const,
		redirect: { return_url: returnUrl },
	}
	if (flow.kind === 'cancel') {
		return {
			type: 'subscription_cancel',
			subscription_cancel: { subscription: flow.subscriptionId },
			after_completion: after,
		}
	}
	if (flow.kind === 'home') return undefined
	const subscription = await client.subscriptions.retrieve(flow.subscriptionId)
	const [item] = subscription.items.data
	if (item === undefined) throw new Error('The subscription has no item.')
	// The quantity is kept (D-373 point 8).
	const price = await priceId(client, flow.lookupKey)
	return {
		type: 'subscription_update_confirm',
		subscription_update_confirm: {
			subscription: flow.subscriptionId,
			items: [{ id: item.id, price, quantity: item.quantity ?? 1 }],
		},
		after_completion: after,
	}
}

const gone: CustomerState = { deleted: true, subscriptions: [], payments: [] }

/** What a customer holds. */
async function stateOf(client: Stripe, id: string): Promise<CustomerState> {
	const customer = await client.customers.retrieve(id)
	if (customer.deleted === true) return gone
	const [subscriptions, intents] = await Promise.all([
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
	])
	const paid = intents.filter(
		({ status, metadata }) =>
			status === 'succeeded' && metadata['managedBy'] === managedBy,
	)
	return {
		deleted: false,
		subscriptions: await Promise.all(
			subscriptions.map(async (one) => subscriptionOf(client, one)),
		),
		payments: await Promise.all(
			paid.map(async (one) => paymentOf(client, one)),
		),
	}
}

/** The billing gateway over Stripe's API. */
export const sdkBilling = (client: Stripe): BillingGateway => ({
	createCustomer: async (profile, idempotencyKey) =>
		guarded('customer', async () => {
			const params = { ...profileParams(profile), metadata: { managedBy } }
			const created = await client.customers.create(params, {
				idempotencyKey,
			})
			return created.id
		}),
	updateCustomer: async (id, profile) =>
		guarded(id, async () => {
			await client.customers.update(id, profileParams(profile))
		}),
	deleteCustomer: async (id) => {
		try {
			await guarded(id, async () => client.customers.del(id))
		} catch (error) {
			if (!(error instanceof Missing)) throw error
		}
	},
	readCustomer: async (id) => {
		try {
			return await guarded(id, async () => stateOf(client, id))
		} catch (error) {
			if (error instanceof Missing) return gone
			throw error
		}
	},
	customerOf: async (type, id) => {
		try {
			return refOf(await guarded(id, async () => ownerOf(client, type, id)))
		} catch (error) {
			if (error instanceof Missing) return null
			throw error
		}
	},
	openCheckout: async (checkout) =>
		guarded(checkout.customerId, async () => {
			const price = await priceId(client, checkout.lookupKey)
			const metadata = {
				...checkout.metadata,
				managedBy,
				product: checkout.product,
			}
			const session = await client.checkout.sessions.create({
				mode: checkout.mode,
				customer: checkout.customerId,
				client_reference_id: checkout.reference,
				line_items: [{ price, quantity: checkout.quantity }],
				success_url: checkout.successUrl,
				cancel_url: checkout.cancelUrl,
				metadata,
				...(checkout.terms && {
					consent_collection: { terms_of_service: 'required' },
				}),
				...(checkout.promotionCodes && { allow_promotion_codes: true }),
				...(checkout.mode === 'subscription'
					? {
							subscription_data: {
								metadata,
								...(checkout.trialDays !== null && {
									trial_period_days: checkout.trialDays,
								}),
							},
						}
					: { payment_intent_data: { metadata } }),
			})
			if (session.url === null) throw new Error('Checkout gave no URL.')
			return session.url
		}),
	expireCheckouts: async (customerId) =>
		guarded(customerId, async () => {
			const open = await all(
				client.checkout.sessions.list({
					customer: customerId,
					status: 'open',
					limit: 100,
				}),
			)
			for (const { id } of open) await client.checkout.sessions.expire(id)
		}),
	checkoutCustomer: async (id) => {
		try {
			const session = await guarded(id, async () =>
				client.checkout.sessions.retrieve(id),
			)
			return refOf(session.customer)
		} catch (error) {
			if (error instanceof Missing) return null
			throw error
		}
	},
	openPortal: async ({ customerId, configuration, returnUrl, flow }) =>
		guarded(customerId, async () => {
			const flowData = await flowOf(client, flow, returnUrl)
			const session = await client.billingPortal.sessions.create({
				customer: customerId,
				return_url: returnUrl,
				...(configuration !== null && { configuration }),
				...(flowData !== undefined && { flow_data: flowData }),
			})
			return session.url
		}),
})

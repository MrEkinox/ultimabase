// The fake account's payers (D-371 point 8): customers, Checkouts a test
// pays, subscriptions and payments, and the thin events each change sends
// to the webhook, signed as Stripe signs them.
import { Stripe } from 'stripe'
import type {
	BillingGateway,
	CheckoutWrite,
	RecoveryGateway,
	CustomerProfile,
	PortalWrite,
	StripeInvoice,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { Missing } from './billing-gateway.ts'
import type { StripePrice } from './gateway.ts'

/** A customer of the fake account. */
export interface FakeCustomer {
	readonly id: string
	readonly profile: CustomerProfile
	readonly deleted: boolean
	/** Its default card: the one a renewal charges (D-380). */
	readonly card: string | null
}

/** A Checkout of the fake account. */
export interface FakeCheckout extends CheckoutWrite {
	readonly id: string
	readonly url: string
	readonly status: 'open' | 'complete' | 'expired'
}

/** What the fake account holds of its payers, and what a test does at Stripe. */
export interface FakeBilling {
	readonly webhookSecret: string
	readonly customers: Map<string, FakeCustomer>
	readonly checkouts: Map<string, FakeCheckout>
	readonly subscriptions: Map<string, StripeSubscription>
	readonly payments: Map<string, StripePayment>
	/** The paid invoices of subscriptions, each period's. */
	readonly invoices: Map<string, StripeInvoice>
	/** Each portal session opened, in order. */
	readonly portalSessions: PortalWrite[]
	/** The subscriptions whose latest payment the plugin refunded. */
	readonly subscriptionRefunds: Set<string>
	/**
	 * Pays an open Checkout, by its URL, as its payer would; gives its id.
	 * `free`: a promotion code took the whole price, and Stripe makes no
	 * payment for a purchase.
	 */
	readonly pay: (url: string, options?: { readonly free?: boolean }) => string
	/** Changes a subscription, as the portal or a renewal would. */
	readonly update: (
		id: string,
		changes: Partial<Omit<StripeSubscription, 'id'>>,
	) => void
	/** Pays a subscription's next period, as Stripe renews it; gives its invoice. */
	readonly renew: (id: string) => string
	/** Refunds a payment or an invoice, all of it by default. */
	readonly refund: (id: string, amount?: number) => void
	readonly loseDispute: (id: string) => void
	/** Deletes a customer, as the dashboard would. */
	readonly deleteCustomer: (id: string) => void
	/** Posts each event sent since the last call to the application at `url`. */
	readonly deliver: (url: string, path?: string) => Promise<void>
}

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

const found = <T>(map: ReadonlyMap<string, T>, id: string): T => {
	const record = map.get(id)
	if (record === undefined) throw new Missing(id)
	return record
}

const day = 24 * 60 * 60 * 1000
const days: Readonly<Record<string, number>> = {
	day: 1,
	week: 7,
	month: 30,
	year: 365,
}
const periodOf = ({ every, everyCount }: StripeSubscription): number =>
	(days[every] ?? 30) * everyCount * day

/** The fake's billing, over its catalog's prices. */
export function fakeBilling(
	prices: ReadonlyMap<string, StripePrice>,
	newId: (prefix: string) => string,
): {
	readonly gateway: BillingGateway & RecoveryGateway
	readonly fake: FakeBilling
} {
	const customers = new Map<string, FakeCustomer>()
	const keys = new Map<string, string>()
	const checkouts = new Map<string, FakeCheckout>()
	const subscriptions = new Map<string, StripeSubscription>()
	const payments = new Map<string, StripePayment>()
	const invoices = new Map<string, StripeInvoice>()
	const portalSessions: PortalWrite[] = []
	const subscriptionRefunds = new Set<string>()
	const sent: string[] = []
	/** Each event's object and time, which Stripe lists for 30 days. */
	const listed: { readonly id: string; readonly type: string; at: Date }[] = []
	const send = (type: string, id: string, object: string) => {
		sent.push(thinEvent({ type, object: { id, type: object } }))
		listed.push({ id, type: object, at: new Date() })
	}
	const ownerOf = (type: string, id: string): string | null => {
		const maps: Record<string, ReadonlyMap<string, { customerId: string }>> = {
			'checkout.session': checkouts,
			subscription: subscriptions,
			payment_intent: payments,
			invoice: invoices,
		}
		if (type === 'customer') return customers.has(id) ? id : null
		return maps[type]?.get(id)?.customerId ?? null
	}
	const priceOf = (lookupKey: string): StripePrice => {
		const held = [...prices.values()].find(
			(one) => one.active && one.lookupKey === lookupKey,
		)
		if (held === undefined) throw new Error(`No price is ${lookupKey}.`)
		return held
	}
	const live = (id: string): FakeCustomer => {
		const customer = found(customers, id)
		if (customer.deleted) throw new Missing(id)
		return customer
	}
	/** Bills a subscription's period, which ends at `end`. */
	const bill = (subscription: StripeSubscription, end: Date): string => {
		const id = newId('in')
		const { product, price, quantity, amount, customerId } = subscription
		const periods = [{ product, price, quantity, end }]
		const refunds = { refunded: 0, disputeLost: false }
		invoices.set(id, { id, customerId, periods, amount, ...refunds })
		send('invoice.paid', id, 'invoice')
		return id
	}
	const subscribe = (checkout: FakeCheckout, price: StripePrice): string => {
		const id = newId('sub')
		const now = Date.now()
		const { every = 'month', count = 1 } = price.recurring ?? {}
		const trialEnd =
			checkout.trialDays === null
				? null
				: new Date(now + checkout.trialDays * day)
		const [product = '', name = ''] = checkout.lookupKey.split('.')
		subscriptions.set(id, {
			id,
			customerId: checkout.customerId,
			product,
			price: name,
			status: trialEnd === null ? 'active' : 'trialing',
			quantity: checkout.quantity,
			amount: (price.amount ?? 0) * checkout.quantity,
			every,
			everyCount: count,
			currentPeriodEnd:
				trialEnd ?? new Date(now + (days[every] ?? 30) * count * day),
			cancelAt: null,
			canceledAt: null,
			trialEnd,
			startedAt: new Date(now),
			scheduled: null,
			card: newId('pm'),
		})
		send('customer.subscription.created', id, 'subscription')
		const created = found(subscriptions, id)
		if (trialEnd === null) bill(created, created.currentPeriodEnd)
		return id
	}
	const charge = (
		checkout: FakeCheckout,
		price: StripePrice,
		free: boolean,
	): string => {
		// A free Checkout stands for its payment, which Stripe does not make.
		const id = free ? checkout.id : newId('pi')
		payments.set(id, {
			id,
			customerId: checkout.customerId,
			product: checkout.product,
			quantity: checkout.quantity,
			amount: free ? 0 : (price.amount ?? 0) * checkout.quantity,
			refunded: 0,
			disputeLost: false,
			paidAt: new Date(),
			receiptUrl: free ? null : `https://pay.stripe.test/receipts/${id}`,
		})
		if (!free) send('payment_intent.succeeded', id, 'payment_intent')
		return id
	}
	const gateway: BillingGateway & RecoveryGateway = {
		createCustomer: async (profile, idempotencyKey) => {
			const held = keys.get(idempotencyKey)
			if (held !== undefined) return held
			const id = newId('cus')
			customers.set(id, { id, profile, deleted: false, card: null })
			keys.set(idempotencyKey, id)
			return id
		},
		updateCustomer: async (id, profile) => {
			customers.set(id, { ...live(id), profile })
		},
		deleteCustomer: async (id) => {
			fake.deleteCustomer(id)
		},
		readCustomer: async (id, options) => {
			const customer = customers.get(id)
			if (customer === undefined || customer.deleted) {
				return { deleted: true, subscriptions: [], payments: [], invoices: [] }
			}
			const own = <T extends { readonly customerId: string }>(
				map: ReadonlyMap<string, T>,
			) => [...map.values()].filter((one) => one.customerId === id)
			return {
				deleted: false,
				subscriptions: own(subscriptions),
				payments: own(payments),
				invoices: options?.invoices === true ? own(invoices) : [],
			}
		},
		customerOf: async (type, id) => ownerOf(type, id),
		openCheckout: async (checkout) => {
			live(checkout.customerId)
			priceOf(checkout.lookupKey)
			const id = newId('cs')
			const url = `https://checkout.stripe.test/${id}`
			checkouts.set(id, { ...checkout, id, url, status: 'open' })
			return url
		},
		expireCheckouts: async (customerId) => {
			live(customerId)
			for (const checkout of checkouts.values()) {
				if (checkout.customerId === customerId && checkout.status === 'open') {
					checkouts.set(checkout.id, { ...checkout, status: 'expired' })
				}
			}
		},
		checkoutCustomer: async (id) => checkouts.get(id)?.customerId ?? null,
		openPortal: async (portal) => {
			live(portal.customerId)
			portalSessions.push(portal)
			return `https://billing.stripe.test/${newId('bps')}`
		},
		moveCard: async ({ id, customerId, card }) => {
			customers.set(customerId, { ...live(customerId), card })
			fake.update(id, { card: null })
		},
		cancelAndRefund: async (id) => {
			const held = found(subscriptions, id)
			if (held.status !== 'canceled') {
				const ended = { status: 'canceled', canceledAt: new Date() }
				subscriptions.set(id, { ...held, ...ended })
				send('customer.subscription.deleted', id, 'subscription')
			}
			subscriptionRefunds.add(id)
		},
		changedSince: async (since) => {
			const changed = new Map<string, Date>()
			for (const { id, type, at } of listed) {
				const customer = ownerOf(type, id)
				if (customer !== null && at > since) changed.set(customer, at)
			}
			return changed
		},
	}
	const fake: FakeBilling = {
		webhookSecret: `whsec_fake_${crypto.randomUUID()}`,
		customers,
		checkouts,
		subscriptions,
		payments,
		invoices,
		portalSessions,
		subscriptionRefunds,
		pay: (url, options) => {
			const checkout = [...checkouts.values()].find((one) => one.url === url)
			if (checkout?.status !== 'open') throw new Error(`${url} is not open.`)
			const price = priceOf(checkout.lookupKey)
			checkouts.set(checkout.id, { ...checkout, status: 'complete' })
			const id =
				checkout.mode === 'subscription'
					? subscribe(checkout, price)
					: charge(checkout, price, options?.free ?? false)
			send('checkout.session.completed', checkout.id, 'checkout.session')
			return id
		},
		update: (id, changes) => {
			subscriptions.set(id, { ...found(subscriptions, id), ...changes })
			send('customer.subscription.updated', id, 'subscription')
		},
		renew: (id) => {
			const held = found(subscriptions, id)
			const start = Math.max(held.currentPeriodEnd.getTime(), Date.now())
			const end = new Date(start + periodOf(held))
			const renewed = { ...held, status: 'active', currentPeriodEnd: end }
			subscriptions.set(id, renewed)
			send('customer.subscription.updated', id, 'subscription')
			return bill(renewed, end)
		},
		refund: (id, amount) => {
			const map: Map<string, StripePayment | StripeInvoice> = invoices.has(id)
				? invoices
				: payments
			const paid = found(map, id)
			const refunded = paid.refunded + (amount ?? paid.amount)
			map.set(id, { ...paid, refunded })
			send(
				'charge.refunded',
				id,
				invoices.has(id) ? 'invoice' : 'payment_intent',
			)
		},
		loseDispute: (id) => {
			const map: Map<string, StripePayment | StripeInvoice> = invoices.has(id)
				? invoices
				: payments
			map.set(id, { ...found(map, id), disputeLost: true })
			send(
				'charge.dispute.closed',
				id,
				invoices.has(id) ? 'invoice' : 'payment_intent',
			)
		},
		deleteCustomer: (id) => {
			const customer = customers.get(id)
			if (customer === undefined || customer.deleted) return
			customers.set(id, { ...customer, deleted: true })
			for (const one of subscriptions.values()) {
				if (one.customerId === id && one.status !== 'canceled') {
					subscriptions.set(one.id, { ...one, status: 'canceled' })
				}
			}
			send('customer.deleted', id, 'customer')
		},
		deliver: async (url, path) => {
			for (const payload of sent.splice(0)) {
				const secret = fake.webhookSecret
				const response = await postEvent(url, payload, { secret, path })
				if (!response.ok) {
					throw new Error(`The webhook answered ${String(response.status)}.`)
				}
			}
		},
	}
	return { gateway, fake }
}

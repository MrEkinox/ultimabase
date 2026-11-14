// What the plugin asks Stripe of its payers: customers, Checkouts, the
// portal, and what a customer holds. `sdkBilling` reaches Stripe; the fake
// of `@ultimabase/stripe/testing` answers in memory.
import { PublicError } from 'ultimabase'

/** What Stripe shows of a payer (D-371). */
export interface CustomerProfile {
	readonly email?: string | null
	readonly name?: string | null
	/** Checkout's and the portal's language: `fr`. */
	readonly locale?: string | null
}

/** A product key and a price name, from a price's metadata. */
export interface PriceKeys {
	readonly product: string | null
	readonly price: string | null
}

/** A subscription, as the plugin reads it. */
export interface StripeSubscription extends PriceKeys {
	readonly id: string
	readonly customerId: string
	/** Its price's id at Stripe, which a log names. */
	readonly priceId: string | null
	readonly status: string
	readonly quantity: number
	/** One period's price times the quantity, before discounts and taxes. */
	readonly amount: number
	readonly every: string
	readonly everyCount: number
	readonly currentPeriodEnd: Date
	readonly cancelAt: Date | null
	readonly canceledAt: Date | null
	readonly trialEnd: Date | null
	readonly startedAt: Date
	/** A change waiting for the period's end. */
	readonly scheduled: (PriceKeys & { readonly at: Date }) | null
	/** The card its Checkout left on it, moved to its customer (D-380). */
	readonly card: string | null
}

/** Stripe's statuses of a subscription that still gives access. */
export const liveStatuses: readonly string[] = [
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'paused',
]

/** A one-time payment of a catalog product. */
export interface StripePayment {
	readonly id: string
	readonly customerId: string
	readonly product: string | null
	/** How many of the product were paid: what it gives, so many times. */
	readonly quantity: number
	readonly amount: number
	readonly refunded: number
	/** Whether a dispute of it was lost. */
	readonly disputeLost: boolean
	readonly paidAt: Date
	readonly receiptUrl: string | null
}

/** A paid invoice of a subscription (D-377 point 4). */
export interface StripeInvoice {
	readonly id: string
	readonly customerId: string
	/** Its lines that bill a whole period above zero: no proration, no trial. */
	readonly periods: readonly (PriceKeys & {
		readonly quantity: number
		/** When the period it bills ends. */
		readonly end: Date
	})[]
	readonly amount: number
	readonly refunded: number
	readonly disputeLost: boolean
}

/** What a customer holds. */
export interface CustomerState {
	/** Deleted, or never found. */
	readonly deleted: boolean
	readonly subscriptions: readonly StripeSubscription[]
	readonly payments: readonly StripePayment[]
	readonly invoices: readonly StripeInvoice[]
}

/** A Checkout the plugin opens. */
export interface CheckoutWrite {
	readonly customerId: string
	/** Its `client_reference_id`: the payer's id. */
	readonly reference: string
	readonly mode: 'subscription' | 'payment'
	readonly product: string
	readonly lookupKey: string
	readonly quantity: number
	readonly trialDays: number | null
	/** The terms checkbox, with the application's text or Stripe's. */
	readonly terms: { readonly acceptance: string | null } | null
	readonly promotionCodes: boolean
	readonly successUrl: string
	readonly cancelUrl: string
	readonly metadata: Readonly<Record<string, string>>
	/** The payer's locale, as its profile gives it. */
	readonly locale: string | null
}

/** The portal's page a session opens on. */
export type PortalFlow =
	| { readonly kind: 'home' }
	| {
			readonly kind: 'change'
			readonly subscriptionId: string
			readonly lookupKey: string
	  }
	| { readonly kind: 'cancel'; readonly subscriptionId: string }
	| { readonly kind: 'paymentMethod' }

/** A portal session the plugin opens. */
export interface PortalWrite {
	readonly customerId: string
	/** The managed configuration, or `null` for the account's default. */
	readonly configuration: string | null
	readonly returnUrl: string
	readonly flow: PortalFlow
	/** The payer's locale, as its profile gives it. */
	readonly locale: string | null
}

/** What the plugin asks Stripe of its payers. */
export interface BillingGateway {
	/** Creates a customer; the same key gives the same one. */
	readonly createCustomer: (
		profile: CustomerProfile,
		idempotencyKey: string,
	) => Promise<string>
	readonly updateCustomer: (
		id: string,
		profile: CustomerProfile,
	) => Promise<void>
	/** Deletes a customer, which ends its subscriptions; a missing one is gone. */
	readonly deleteCustomer: (id: string) => Promise<void>
	/**
	 * What a customer holds; if asked, of the last 400 days, its paid
	 * invoices and its Checkouts a full discount made free.
	 */
	readonly readCustomer: (
		id: string,
		options?: { readonly invoices?: boolean; readonly free?: boolean },
	) => Promise<CustomerState>
	/** The customer an event's object belongs to, if any. */
	readonly customerOf: (type: string, id: string) => Promise<string | null>
	/** Opens a Checkout; returns its URL. */
	readonly openCheckout: (checkout: CheckoutWrite) => Promise<string>
	/** Expires the customer's open Checkouts. */
	readonly expireCheckouts: (customerId: string) => Promise<void>
	/** A Checkout's customer, or `null` for an unknown id. */
	readonly checkoutCustomer: (id: string) => Promise<string | null>
	/** Opens a portal session; returns its URL. */
	readonly openPortal: (portal: PortalWrite) => Promise<string>
	/** Makes a subscription's card its customer's, then clears its own (D-380). */
	readonly moveCard: (
		one: Pick<StripeSubscription, 'id' | 'customerId'> & { card: string },
	) => Promise<void>
}

/** What the plugin asks Stripe to set right what went wrong (D-375). */
export interface RecoveryGateway {
	/**
	 * Ends a subscription at once, unless it ended, and refunds its latest
	 * payment; done again, it changes nothing.
	 */
	readonly cancelAndRefund: (id: string) => Promise<void>
	/**
	 * The customers whose objects Stripe's events changed after `since`, with
	 * the time of each one's last event.
	 */
	readonly changedSince: (since: Date) => Promise<ReadonlyMap<string, Date>>
	/** The charge an early fraud warning or a dispute is about (D-388). */
	readonly riskOf: (type: string, id: string) => Promise<StripeRisk | null>
	/**
	 * Refunds a charge in full; done again, or for a charge refunded or
	 * disputed, it changes nothing.
	 */
	readonly refundCharge: (id: string) => Promise<void>
	/**
	 * Ends at once each of a customer's subscriptions that has not ended;
	 * gives their ids.
	 */
	readonly cancelSubscriptions: (
		customerId: string,
	) => Promise<readonly string[]>
}

/** A charge at risk (D-388). */
export interface StripeRisk {
	readonly charge: string
	/** An early fraud warning Stripe still holds actionable. */
	readonly refundable: boolean
}

/** An object Stripe does not hold, or no longer does. */
export class Missing extends Error {
	constructor(id: string) {
		super(`Stripe holds no ${id}.`)
		this.name = 'Missing'
	}
}

/** `PAYMENT_UNAVAILABLE` (D-371): Stripe cannot be reached, or no key is set. */
export const unavailable = (cause?: unknown): PublicError =>
	new PublicError('PAYMENT_UNAVAILABLE', 'Payments are unavailable.', {
		cause,
	})

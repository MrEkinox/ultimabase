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
	readonly status: string
	readonly quantity: number
	readonly currentPeriodEnd: Date
	readonly cancelAt: Date | null
	readonly canceledAt: Date | null
	readonly trialEnd: Date | null
	readonly startedAt: Date
	/** A change waiting for the period's end. */
	readonly scheduled: (PriceKeys & { readonly at: Date }) | null
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
	readonly amount: number
	readonly refunded: number
	/** Whether a dispute of it was lost. */
	readonly disputeLost: boolean
	readonly paidAt: Date
}

/** What a customer holds. */
export interface CustomerState {
	/** Deleted, or never found. */
	readonly deleted: boolean
	readonly subscriptions: readonly StripeSubscription[]
	readonly payments: readonly StripePayment[]
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
	readonly terms: boolean
	readonly promotionCodes: boolean
	readonly successUrl: string
	readonly cancelUrl: string
	readonly metadata: Readonly<Record<string, string>>
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

/** A portal session the plugin opens. */
export interface PortalWrite {
	readonly customerId: string
	/** The managed configuration, or `null` for the account's default. */
	readonly configuration: string | null
	readonly returnUrl: string
	readonly flow: PortalFlow
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
	readonly readCustomer: (id: string) => Promise<CustomerState>
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

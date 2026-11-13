// The fields each billing model adds to the application's own (D-373,
// D-377), typed by the product and price enums it was given (D-387).
import type { Field, One, ScalarOptions } from 'ultimabase'
import type { Every } from './product.ts'

type Text = Field<string, ScalarOptions<string>>
type Int = Field<number, { readonly integer: true }>
type Moment = Field<Date, ScalarOptions<Date>>
type Optional<V> = Field<V | null, { readonly optional: true }>
type StripeId = Field<string, { readonly unique: true }>
type PayerOf<P> = One<P, { readonly onDelete: 'cascade' }>
type OneOf<V extends string> = Field<V, ScalarOptions<string>>

/** Stripe's statuses of a subscription. */
export type SubscriptionStatus =
	| 'incomplete'
	| 'incomplete_expired'
	| 'trialing'
	| 'active'
	| 'past_due'
	| 'canceled'
	| 'unpaid'
	| 'paused'
export const statuses: readonly SubscriptionStatus[] = [
	'incomplete',
	'incomplete_expired',
	'trialing',
	'active',
	'past_due',
	'canceled',
	'unpaid',
	'paused',
]
export const intervals: readonly Every[] = ['day', 'week', 'month', 'year']

/**
 * The fields `defineSubscription` adds; `P` is the payer's thunk, `K` and
 * `R` the values of its `product` and `price` enums (D-387).
 */
export type SubscriptionFields<
	P,
	K extends string = string,
	R extends string = string,
> = {
	readonly payer: PayerOf<P>
	readonly stripeId: StripeId
	/** The product's key and the price's name (D-372). */
	readonly product: OneOf<K>
	readonly price: OneOf<R>
	readonly status: OneOf<SubscriptionStatus>
	readonly quantity: Int
	/**
	 * What one period costs, times the quantity, before discounts and taxes,
	 * in the currency's smallest unit: the price the payer subscribed at.
	 */
	readonly amount: Int
	/** The price's interval: every `everyCount` `every`. */
	readonly every: OneOf<Every>
	readonly everyCount: Int
	readonly currentPeriodEnd: Moment
	readonly cancelAt: Optional<Date>
	readonly canceledAt: Optional<Date>
	readonly trialEnd: Optional<Date>
	readonly startedAt: Moment
	/** A change that waits for the period's end (D-373 point 8). */
	readonly scheduledProduct: Optional<K>
	readonly scheduledPrice: Optional<R>
	readonly scheduledAt: Optional<Date>
}

/** The fields `definePurchase` adds; `K`, its `product` enum's values. */
export type PurchaseFields<P, K extends string = string> = {
	readonly payer: PayerOf<P>
	readonly stripeId: StripeId
	readonly product: OneOf<K>
	readonly quantity: Int
	/** In the currency's smallest unit. */
	readonly amount: Int
	readonly refunded: Int
	readonly status: OneOf<'paid' | 'refunded'>
	readonly paidAt: Moment
	/** Stripe's receipt page. */
	readonly receiptUrl: Optional<string>
}

/** The fields `defineBalance` adds. */
export type BalanceFields<P> = {
	readonly owner: PayerOf<P>
	/** The credit's key (D-372). */
	readonly credit: Text
	/** Never below zero. */
	readonly amount: Int
}

/** The fields `defineCreditHistory` adds: one move of credits (D-377). */
export type CreditHistoryFields<P> = {
	readonly owner: PayerOf<P>
	readonly credit: Text
	/** Positive when given, negative when spent or taken back. */
	readonly change: Int
	/** `purchase`, `subscription`, `refund`, or the application's own. */
	readonly reason: Text
	/** The Stripe payment or invoice that moved it. */
	readonly payment: Optional<string>
}

// What the gateways over Stripe's API share: Stripe's errors as the
// plugin's, lists read whole, and the keys a price's metadata holds.
import { Stripe } from 'stripe'
import type { PriceKeys } from './billing-gateway.ts'
import { Missing, unavailable } from './billing-gateway.ts'

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

/** Every item of a list, past its pages: no cap drops one. */
export const all = async <T>(list: AsyncIterable<T>): Promise<T[]> => {
	const items: T[] = []
	for await (const item of list) items.push(item)
	return items
}

export type Ref = string | { readonly id: string } | null
export const refOf = (value: Ref): string | null =>
	value === null || typeof value === 'string' ? value : value.id

export const dateOf = (seconds: number): Date => new Date(seconds * 1000)
export const maybeDate = (seconds: number | null): Date | null =>
	seconds === null ? null : dateOf(seconds)

export const keysOf = (price: Stripe.Price | Stripe.DeletedPrice): PriceKeys =>
	'metadata' in price
		? {
				product: price.metadata['product'] ?? null,
				price: price.metadata['price'] ?? null,
			}
		: { product: null, price: null }

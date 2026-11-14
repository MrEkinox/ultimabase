// The application's enums of a billing model's product and price (D-387):
// refused at start when they miss a key of the catalog, and checked by the
// sync, since a product removed from the catalog leaves the check.
import type { Enum } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { StripeSubscription } from './billing-gateway.ts'
import type { Enums } from './kinds.ts'
import type { Product } from './product.ts'
import type { Billing } from './running.ts'

type Option = keyof Enums

/** Refuses a key of the catalog that the model's enum `option` misses. */
function refuseMissing(
	entry: string,
	model: Billing | undefined,
	option: Option,
	keys: readonly string[],
	what: string,
): void {
	const values = model?.enums[option]?.values
	if (model === undefined || values === undefined) return
	const key = keys.find((one) => !values.includes(one))
	if (key === undefined) return
	throw new Refused(
		`${entry}(${model.name}): ${option} misses '${key}', ${what} of the catalog.`,
	)
}

/** Refuses enums that miss a product key or a price name of the catalog. */
export function checkEnums(
	products: readonly Product[],
	subscription: Billing | undefined,
	purchase: Billing | undefined,
): void {
	const recurring = products.flatMap((one) => ('prices' in one ? [one] : []))
	const once = products.filter((one) => !('prices' in one))
	const keys = recurring.map(({ key }) => key)
	const prices = recurring.flatMap(({ prices: each }) => Object.keys(each))
	const subscribe = 'defineSubscription'
	refuseMissing(subscribe, subscription, 'product', keys, 'a key')
	refuseMissing(subscribe, subscription, 'price', prices, 'a price name')
	const keysOnce = once.map(({ key }) => key)
	refuseMissing('definePurchase', purchase, 'product', keysOnce, 'a key')
}

const takes = (typed: Enum | undefined, value: string | null) =>
	value === null || typed === undefined || typed.values.includes(value)

/** Whether the model's enums take the subscription's products and prices. */
export const fits = (enums: Enums, one: StripeSubscription): boolean =>
	takes(enums.product, one.product) &&
	takes(enums.price, one.price) &&
	takes(enums.product, one.scheduled?.product ?? null) &&
	takes(enums.price, one.scheduled?.price ?? null)

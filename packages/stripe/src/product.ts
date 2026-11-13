// `defineProduct` (D-372): what an application sells, either a subscription
// with its recurring prices or a one-time product with the credits it gives.
// The catalog writes it to Stripe; the product's key never changes.
import { Refused } from 'ultimabase'
import type { CreditAmount } from './credit.ts'
import { checkKey, ownKeys, whereOf } from './keys.ts'

/** How often a recurring price bills. */
export type Every = 'day' | 'week' | 'month' | 'year'

/** A subscription's price, billed every `everyCount` (1 by default) `every`. */
export interface RecurringPrice {
	/** In the currency's smallest unit: `9_90` is 9.90 €. */
	readonly amount: number
	readonly every: Every
	readonly everyCount?: number
	/** The credits each paid period gives (D-377 point 4). */
	readonly gives?: readonly CreditAmount[]
}

/** A one-time product's price. */
export interface OneTimePrice {
	/** In the currency's smallest unit. */
	readonly amount: number
}

/** A subscription, with its recurring prices by name. */
export interface SubscriptionProduct<
	K extends string = string,
	P extends string = string,
> {
	/** The product's name in the application, never changed. */
	readonly key: K
	/** What Checkout and the invoices show. */
	readonly name: string
	/** Its Stripe Tax code, `txcd_…`. */
	readonly taxCode?: string
	readonly prices: { readonly [N in P]: RecurringPrice }
}

/** A product paid once, and the credits it gives. */
export interface OneTimeProduct<K extends string = string> {
	readonly key: K
	readonly name: string
	readonly taxCode?: string
	readonly price: OneTimePrice
	readonly gives: readonly CreditAmount[]
}

/** A product of the catalog. */
export type Product = SubscriptionProduct | OneTimeProduct

/** Stripe bills at most every three years. */
const longest: Readonly<Record<Every, number>> = {
	day: 1095,
	week: 156,
	month: 36,
	year: 3,
}
const productKeys = ['key', 'name', 'taxCode', 'prices', 'price', 'gives']

/** Refuses an amount that is not a positive integer. */
function checkAmount(where: string, amount: unknown): void {
	if (!Number.isSafeInteger(amount) || Number(amount) <= 0) {
		throw new Refused(
			`${where}: the amount ${String(amount)} is not a positive integer, in the currency's smallest unit.`,
		)
	}
}

/** Refuses a recurring price Stripe would refuse; returns its interval. */
function checkRecurring(where: string, price: unknown): string {
	ownKeys(where, price, ['amount', 'every', 'everyCount', 'gives'])
	checkAmount(where, Reflect.get(price, 'amount'))
	checkGives(where, Reflect.get(price, 'gives') ?? [])
	const every: unknown = Reflect.get(price, 'every')
	const most = Object.entries(longest).find(([name]) => name === every)?.[1]
	if (most === undefined) {
		throw new Refused(`${where}: every is 'day', 'week', 'month' or 'year'.`)
	}
	const count: unknown = Reflect.get(price, 'everyCount') ?? 1
	if (
		!Number.isSafeInteger(count) ||
		Number(count) < 1 ||
		Number(count) > most
	) {
		throw new Refused(
			`${where}: everyCount is an integer from 1 to ${String(most)}.`,
		)
	}
	return `${String(count)} ${String(every)}`
}

/** Refuses a subscription's prices: none, a bad one, or two of one interval. */
function checkPrices(where: string, prices: unknown): void {
	if (typeof prices !== 'object' || prices === null) {
		throw new Refused(`${where}: prices holds the recurring prices by name.`)
	}
	const names = Object.keys(prices)
	if (names.length === 0) {
		throw new Refused(`${where}: prices holds at least one price.`)
	}
	// The customer portal takes one price per interval of a product.
	const intervals = new Map<string, string>()
	for (const name of names) {
		checkKey(where, name)
		const price: unknown = Reflect.get(prices, name)
		const interval = checkRecurring(`${where}.${name}`, price)
		const other = intervals.get(interval)
		if (other !== undefined) {
			throw new Refused(
				`${where}: ${other} and ${name} both bill every ${interval}; a product has one price per interval.`,
			)
		}
		intervals.set(interval, name)
	}
}

/** Refuses what a one-time product gives: one credit twice, or a bad one. */
function checkGives(where: string, gives: unknown): void {
	if (!Array.isArray(gives)) {
		throw new Refused(`${where}: gives lists credits, as [blueGems(500)].`)
	}
	const given = new Set<unknown>()
	for (const item of gives) {
		const credit: unknown =
			typeof item === 'object' && item !== null
				? Reflect.get(item, 'credit')
				: undefined
		if (typeof credit !== 'string') {
			throw new Refused(`${where}: gives lists credits, as [blueGems(500)].`)
		}
		checkAmount(`${where} gives ${credit}`, Reflect.get(Object(item), 'amount'))
		if (given.has(credit)) {
			throw new Refused(`${where}: gives ${credit} twice.`)
		}
		given.add(credit)
	}
}

/** A subscription and its recurring prices (D-372). */
export function defineProduct<
	const K extends string,
	const P extends string,
>(definition: {
	readonly key: K
	readonly name: string
	readonly taxCode?: string
	readonly prices: { readonly [N in P]: RecurringPrice }
}): SubscriptionProduct<K, P>
/** A product paid once, and the credits it gives (D-372). */
export function defineProduct<const K extends string>(definition: {
	readonly key: K
	readonly name: string
	readonly taxCode?: string
	readonly price: OneTimePrice
	readonly gives?: readonly CreditAmount[]
}): OneTimeProduct<K>
export function defineProduct(definition: {
	readonly key: string
	readonly name: string
	readonly taxCode?: string
	readonly prices?: Readonly<Record<string, RecurringPrice>>
	readonly price?: OneTimePrice
	readonly gives?: readonly CreditAmount[]
}): Product {
	ownKeys('defineProduct', definition, productKeys)
	checkKey('defineProduct', definition.key)
	const where = whereOf('defineProduct', definition)
	const { key, name, taxCode, prices, price } = definition
	if (typeof name !== 'string' || name.trim() === '') {
		throw new Refused(`${where}: name is what Checkout and the invoices show.`)
	}
	if (taxCode !== undefined && typeof taxCode !== 'string') {
		throw new Refused(
			`${where}: taxCode is a Stripe Tax code, as txcd_10000000.`,
		)
	}
	const tax = taxCode === undefined ? {} : { taxCode }
	if ((prices === undefined) === (price === undefined)) {
		throw new Refused(
			`${where}: a product has either prices, recurring, or one price, paid once.`,
		)
	}
	if (price === undefined) {
		if (definition.gives !== undefined) {
			throw new Refused(`${where}: gives goes with a one-time price.`)
		}
		checkPrices(where, prices)
		return Object.freeze({ key, name, ...tax, prices: { ...prices } })
	}
	ownKeys(where, price, ['amount'])
	checkAmount(where, price.amount)
	const gives = definition.gives ?? []
	checkGives(where, gives)
	return Object.freeze({
		key,
		name,
		...tax,
		price: { amount: price.amount },
		gives: [...gives],
	})
}

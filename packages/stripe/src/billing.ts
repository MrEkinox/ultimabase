// `defineSubscription`, `definePurchase`, `defineBalance` and
// `defineCreditHistory` (D-373, D-377): the application's own models of what
// a payer bought and of its credits, which only the plugin writes. Each is an ordinary model with the plugin first in its `use`.
import type {
	Enum,
	FieldShapes,
	IndexShape,
	ModelFields,
	ModelIndexes,
	ModelOf,
	ModelUse,
	PluginTypes,
} from 'ultimabase'
import { defineModel, Refused } from 'ultimabase'
import { knownKeys } from 'ultimabase/internal'
import type { FieldBuilders } from 'ultimabase'
import { billingModels, type Kind } from './kinds.ts'
import type { Stripe } from './plugin.ts'
import { stripeUse } from './plugin.ts'
import type {
	BalanceFields,
	CreditHistoryFields,
	PurchaseFields,
	SubscriptionFields,
} from './billing-fields.ts'
import { intervals, statuses } from './billing-fields.ts'

type Uses = readonly ModelUse<string, PluginTypes>[]
/** A billing model's `use`: the plugin first, then the developer's. */
export type WithStripe<U extends Uses> = readonly [
	ModelUse<'stripe', Stripe>,
	...U,
]

type Definition<N, F, U extends Uses, X, A> = {
	readonly name: N
	/** The stored table's or collection's name (D-63). */
	readonly dbName?: string
	readonly use?: U
	readonly indexes?: ModelIndexes<X, F & A, WithStripe<U>>
}
type Own<F, U extends Uses> = { readonly fields: ModelFields<F, WithStripe<U>> }
/** The enums that type a subscription's product and price (D-387). */
type Typed<K extends string, R extends string> = {
	readonly product?: Enum<K>
	readonly price?: Enum<R>
}
/** The enum that types a purchase's product (D-387). */
type TypedOnce<K extends string> = { readonly product?: Enum<K> }
type Enums = { product?: Enum; price?: Enum }

const added = (
	f: FieldBuilders<never>,
	kind: Kind,
	payer: () => object,
	typed: Enums,
): object => {
	const ref = f.one(payer, { onDelete: 'cascade' })
	const optional = { optional: true } as const
	// A key the enum, if any, takes (D-387).
	const keyed = (values: Enum | undefined, option?: typeof optional) =>
		values === undefined ? f.string(option) : f.enumOf(values, option)
	if (kind === 'subscription') {
		return {
			payer: ref,
			stripeId: f.string({ unique: true }),
			product: keyed(typed.product),
			price: keyed(typed.price),
			status: f.enumOf(statuses),
			quantity: f.number({ integer: true }),
			amount: f.number({ integer: true }),
			every: f.enumOf(intervals),
			everyCount: f.number({ integer: true }),
			currentPeriodEnd: f.dateTime(),
			cancelAt: f.dateTime(optional),
			canceledAt: f.dateTime(optional),
			trialEnd: f.dateTime(optional),
			startedAt: f.dateTime(),
			scheduledProduct: keyed(typed.product, optional),
			scheduledPrice: keyed(typed.price, optional),
			scheduledAt: f.dateTime(optional),
		}
	}
	if (kind === 'purchase') {
		return {
			payer: ref,
			stripeId: f.string({ unique: true }),
			product: keyed(typed.product),
			quantity: f.number({ integer: true }),
			amount: f.number({ integer: true }),
			refunded: f.number({ integer: true }),
			status: f.enumOf(['paid', 'refunded']),
			paidAt: f.dateTime(),
			receiptUrl: f.string(optional),
		}
	}
	if (kind === 'history') {
		return {
			owner: ref,
			credit: f.string(),
			change: f.number({ integer: true }),
			reason: f.string(),
			payment: f.string(optional),
		}
	}
	return {
		owner: ref,
		credit: f.string(),
		amount: f.number({ integer: true }),
	}
}

/** The indexes the plugin's queries need. */
const indexesOf = (kind: Kind): readonly IndexShape[] => {
	if (kind === 'balance') return [{ fields: ['owner', 'credit'], unique: true }]
	// A payment gives its credits once: its moves are looked up by it.
	if (kind === 'history') return [{ fields: ['payment'] }]
	return []
}

// The kernel checks the model the thunk returns.
const isThunk = (value: unknown): value is () => object =>
	typeof value === 'function'

const entries = {
	subscription: ['defineSubscription', 'payer', ['product', 'price']],
	purchase: ['definePurchase', 'payer', ['product']],
	balance: ['defineBalance', 'owner', []],
	history: ['defineCreditHistory', 'owner', []],
} as const

const isEnum = (value: unknown): value is Enum =>
	typeof value === 'object' &&
	value !== null &&
	Array.isArray(Reflect.get(value, 'values'))

type Loose = {
	readonly name: string
	readonly dbName?: string
	readonly use?: Uses
	readonly fields?: Function
	readonly indexes?: readonly IndexShape[]
}

/** Builds a billing model of `kind` from the developer's definition. */
function billingModel(kind: Kind, definition: Loose): object {
	const [entry, key, options] = entries[kind]
	const { name, fields } = definition
	const keys = ['name', 'dbName', key, 'use', 'fields', 'indexes', ...options]
	knownKeys(name, definition, keys, 'access, hooks and plugin options')
	const payer: unknown = Reflect.get(definition, key)
	if (!isThunk(payer)) {
		throw new Refused(`${entry}(${name}): ${key} is () => its model.`)
	}
	const target = payer
	const typed: Enums = {}
	for (const option of options) {
		const value: unknown = Reflect.get(definition, option)
		if (value === undefined) continue
		if (!isEnum(value)) {
			throw new Refused(`${entry}(${name}): ${option} is a defineEnum.`)
		}
		typed[option] = value
	}
	const model: object = defineModel<
		string,
		FieldShapes,
		Uses,
		readonly IndexShape[]
	>({
		name,
		...(definition.dbName === undefined ? {} : { dbName: definition.dbName }),
		use: [stripeUse(), ...(definition.use ?? [])],
		fields: (f) => {
			const own: unknown =
				fields === undefined ? {} : Reflect.apply(fields, undefined, [f])
			if (typeof own !== 'object' || own === null) {
				throw new Refused(`${entry}(${name}): fields returns an object.`)
			}
			const adds = added(f, kind, target, typed)
			const taken = Object.keys(adds).find((field) => Object.hasOwn(own, field))
			if (taken !== undefined) {
				throw new Refused(
					`${entry}(${name}): ${taken} is a field ${entry} adds.`,
				)
			}
			return { ...own, ...adds }
		},
		indexes: [...indexesOf(kind), ...(definition.indexes ?? [])],
	})
	const enums = {
		...(typed.product && { product: typed.product.values }),
		...(typed.price && { price: typed.price.values }),
	}
	billingModels.set(model, { kind, payer: target, enums })
	return model
}

/** The application's subscriptions, with its own fields (D-373). */
export function defineSubscription<
	const N extends string,
	const P extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
	const K extends string = string,
	const R extends string = string,
>(
	definition: Definition<N, F, U, X, SubscriptionFields<P, K, R>> &
		Own<F, U> & { readonly payer: P } & Typed<K, R>,
): ModelOf<N, F & SubscriptionFields<P, K, R>, WithStripe<U>, X>
/** The application's subscriptions (D-373). */
export function defineSubscription<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
	const K extends string = string,
	const R extends string = string,
>(
	definition: Definition<N, {}, U, X, SubscriptionFields<P, K, R>> & {
		readonly payer: P
	} & Typed<K, R>,
): ModelOf<N, SubscriptionFields<P, K, R>, WithStripe<U>, X>
export function defineSubscription(definition: Loose): object {
	return billingModel('subscription', definition)
}

/** The application's one-time purchases, with its own fields (D-373). */
export function definePurchase<
	const N extends string,
	const P extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
	const K extends string = string,
>(
	definition: Definition<N, F, U, X, PurchaseFields<P, K>> &
		Own<F, U> & { readonly payer: P } & TypedOnce<K>,
): ModelOf<N, F & PurchaseFields<P, K>, WithStripe<U>, X>
/** The application's one-time purchases (D-373). */
export function definePurchase<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
	const K extends string = string,
>(
	definition: Definition<N, {}, U, X, PurchaseFields<P, K>> & {
		readonly payer: P
	} & TypedOnce<K>,
): ModelOf<N, PurchaseFields<P, K>, WithStripe<U>, X>
export function definePurchase(definition: Loose): object {
	return billingModel('purchase', definition)
}

/** The application's credit balances, with its own fields (D-374). */
export function defineBalance<
	const N extends string,
	const P extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, F, U, X, BalanceFields<P>> &
		Own<F, U> & { readonly owner: P },
): ModelOf<N, F & BalanceFields<P>, WithStripe<U>, X>
/** The application's credit balances (D-374). */
export function defineBalance<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, {}, U, X, BalanceFields<P>> & {
		readonly owner: P
	},
): ModelOf<N, BalanceFields<P>, WithStripe<U>, X>
export function defineBalance(definition: Loose): object {
	return billingModel('balance', definition)
}

/** The application's history of credits, with its own fields (D-377). */
export function defineCreditHistory<
	const N extends string,
	const P extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, F, U, X, CreditHistoryFields<P>> &
		Own<F, U> & { readonly owner: P },
): ModelOf<N, F & CreditHistoryFields<P>, WithStripe<U>, X>
/** The application's history of credits: each move, given or spent (D-377). */
export function defineCreditHistory<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, {}, U, X, CreditHistoryFields<P>> & {
		readonly owner: P
	},
): ModelOf<N, CreditHistoryFields<P>, WithStripe<U>, X>
export function defineCreditHistory(definition: Loose): object {
	return billingModel('history', definition)
}

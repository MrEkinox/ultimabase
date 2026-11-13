// `defineSubscription`, `definePurchase` and `defineBalance` (D-373): the
// application's own models of what a payer bought, which only the plugin
// writes. Each is an ordinary model with the plugin first in its `use`.
import type {
	Field,
	FieldShapes,
	IndexShape,
	ModelFields,
	ModelIndexes,
	ModelOf,
	ModelUse,
	One,
	PluginTypes,
	ScalarOptions,
} from 'ultimabase'
import { defineModel, Refused } from 'ultimabase'
import { knownKeys } from 'ultimabase/internal'
import type { FieldBuilders } from 'ultimabase'
import { billingModels, type Kind } from './kinds.ts'
import type { Stripe } from './plugin.ts'
import { stripeUse } from './plugin.ts'

type Uses = readonly ModelUse<string, PluginTypes>[]
/** A billing model's `use`: the plugin first, then the developer's. */
export type WithStripe<U extends Uses> = readonly [
	ModelUse<'stripe', Stripe>,
	...U,
]

type Text = Field<string, ScalarOptions<string>>
type Int = Field<number, { readonly integer: true }>
type Moment = Field<Date, ScalarOptions<Date>>
type Optional<V> = Field<V | null, { readonly optional: true }>
type StripeId = Field<string, { readonly unique: true }>
type PayerOf<P> = One<P, { readonly onDelete: 'cascade' }>

/** The fields `defineSubscription` adds; `P` is the payer's thunk. */
export type SubscriptionFields<P> = {
	readonly payer: PayerOf<P>
	readonly stripeId: StripeId
	/** The product's key and the price's name (D-372). */
	readonly product: Text
	readonly price: Text
	/** Stripe's: `active`, `trialing`, `past_due`, `canceled`… */
	readonly status: Text
	readonly quantity: Int
	readonly currentPeriodEnd: Moment
	readonly cancelAt: Optional<Date>
	readonly canceledAt: Optional<Date>
	readonly trialEnd: Optional<Date>
	readonly startedAt: Moment
	/** A change that waits for the period's end (D-373 point 8). */
	readonly scheduledProduct: Optional<string>
	readonly scheduledPrice: Optional<string>
	readonly scheduledAt: Optional<Date>
}

/** The fields `definePurchase` adds. */
export type PurchaseFields<P> = {
	readonly payer: PayerOf<P>
	readonly stripeId: StripeId
	readonly product: Text
	/** In the currency's smallest unit. */
	readonly amount: Int
	readonly refunded: Int
	readonly status: Field<'paid' | 'refunded', ScalarOptions<string>>
	readonly paidAt: Moment
}

/** The fields `defineBalance` adds. */
export type BalanceFields<P> = {
	readonly owner: PayerOf<P>
	/** The credit's key (D-372). */
	readonly credit: Text
	/** Never below zero. */
	readonly amount: Int
}

type Definition<N, F, U extends Uses, X, A> = {
	readonly name: N
	/** The stored table's or collection's name (D-63). */
	readonly dbName?: string
	readonly use?: U
	readonly indexes?: ModelIndexes<X, F & A, WithStripe<U>>
}
type Own<F, U extends Uses> = { readonly fields: ModelFields<F, WithStripe<U>> }

const added = (
	f: FieldBuilders<never>,
	kind: Kind,
	payer: () => object,
): object => {
	const ref = f.one(payer, { onDelete: 'cascade' })
	const optional = { optional: true } as const
	if (kind === 'subscription') {
		return {
			payer: ref,
			stripeId: f.string({ unique: true }),
			product: f.string(),
			price: f.string(),
			status: f.string(),
			quantity: f.number({ integer: true }),
			currentPeriodEnd: f.dateTime(),
			cancelAt: f.dateTime(optional),
			canceledAt: f.dateTime(optional),
			trialEnd: f.dateTime(optional),
			startedAt: f.dateTime(),
			scheduledProduct: f.string(optional),
			scheduledPrice: f.string(optional),
			scheduledAt: f.dateTime(optional),
		}
	}
	if (kind === 'purchase') {
		return {
			payer: ref,
			stripeId: f.string({ unique: true }),
			product: f.string(),
			amount: f.number({ integer: true }),
			refunded: f.number({ integer: true }),
			status: f.enumOf(['paid', 'refunded']),
			paidAt: f.dateTime(),
		}
	}
	return {
		owner: ref,
		credit: f.string(),
		amount: f.number({ integer: true }),
	}
}

// The kernel checks the model the thunk returns.
const isThunk = (value: unknown): value is () => object =>
	typeof value === 'function'

const entries = {
	subscription: ['defineSubscription', 'payer'],
	purchase: ['definePurchase', 'payer'],
	balance: ['defineBalance', 'owner'],
} as const

type Loose = {
	readonly name: string
	readonly dbName?: string
	readonly use?: Uses
	readonly fields?: Function
	readonly indexes?: readonly IndexShape[]
}

/** Builds a billing model of `kind` from the developer's definition. */
function billingModel(kind: Kind, definition: Loose): object {
	const [entry, key] = entries[kind]
	const { name, fields } = definition
	const keys = ['name', 'dbName', key, 'use', 'fields', 'indexes']
	knownKeys(name, definition, keys, 'access, hooks and plugin options')
	const payer: unknown = Reflect.get(definition, key)
	if (!isThunk(payer)) {
		throw new Refused(`${entry}(${name}): ${key} is () => its model.`)
	}
	const target = payer
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
			const adds = added(f, kind, target)
			const taken = Object.keys(adds).find((field) => Object.hasOwn(own, field))
			if (taken !== undefined) {
				throw new Refused(
					`${entry}(${name}): ${taken} is a field ${entry} adds.`,
				)
			}
			return { ...own, ...adds }
		},
		indexes: [
			...(kind === 'balance'
				? [{ fields: ['owner', 'credit'], unique: true }]
				: []),
			...(definition.indexes ?? []),
		],
	})
	billingModels.set(model, { kind, payer: target })
	return model
}

/** The application's subscriptions, with its own fields (D-373). */
export function defineSubscription<
	const N extends string,
	const P extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, F, U, X, SubscriptionFields<P>> &
		Own<F, U> & { readonly payer: P },
): ModelOf<N, F & SubscriptionFields<P>, WithStripe<U>, X>
/** The application's subscriptions (D-373). */
export function defineSubscription<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, {}, U, X, SubscriptionFields<P>> & {
		readonly payer: P
	},
): ModelOf<N, SubscriptionFields<P>, WithStripe<U>, X>
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
>(
	definition: Definition<N, F, U, X, PurchaseFields<P>> &
		Own<F, U> & { readonly payer: P },
): ModelOf<N, F & PurchaseFields<P>, WithStripe<U>, X>
/** The application's one-time purchases (D-373). */
export function definePurchase<
	const N extends string,
	const P extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: Definition<N, {}, U, X, PurchaseFields<P>> & {
		readonly payer: P
	},
): ModelOf<N, PurchaseFields<P>, WithStripe<U>, X>
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

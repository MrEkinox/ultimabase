// The running plugin's state, which its server calls and jobs read: one
// application runs at a time in a realm.
import type { Stripe } from 'stripe'
import type { Logger, QueryOptions } from 'ultimabase'
import type { Gateway } from './accounts.ts'
import type { CustomerProfile } from './billing-gateway.ts'
import { unavailable } from './billing-gateway.ts'
import type { Catalog } from './catalog.ts'
import type { Enums } from './kinds.ts'
import type { Product } from './product.ts'
import type { RiskOptions } from './risk.ts'

/** A row as the plugin reads it, from a model it does not type. */
export type Row = { readonly id: string; readonly [field: string]: unknown }

/** The queries the plugin sends to the application's models. */
export interface Rows {
	findUnique(args: object, options: QueryOptions): Promise<Row | null>
	findMany(args: object, options: QueryOptions): Promise<readonly Row[]>
	create(args: object, options: QueryOptions): Promise<Row>
	update(args: object, options: QueryOptions): Promise<Row>
	upsert(args: object, options: QueryOptions): Promise<Row>
	updateManyAndReturn(
		args: object,
		options: QueryOptions,
	): Promise<readonly Row[]>
	groupBy(
		args: object,
		options: QueryOptions,
	): Promise<readonly Readonly<Record<string, unknown>>[]>
}

const methods = [
	'findUnique',
	'findMany',
	'create',
	'update',
	'upsert',
	'updateManyAndReturn',
	'groupBy',
]

const isRows = (queries: object): queries is Rows =>
	methods.every((name) => typeof Reflect.get(queries, name) === 'function')

/** A model's queries, as the plugin sends them. */
export function rowsOf(queries: object): Rows {
	if (isRows(queries)) return queries
	throw new TypeError('A model’s queries were expected.')
}

/** A model the plugin writes, with its payer's model. */
export interface Billing {
	readonly name: string
	readonly queries: Rows
	/** The payer's or owner's model: its name and queries. */
	readonly payer: { readonly name: string; readonly queries: Rows }
	/** The values of its `product` and `price` enums, if typed (D-387). */
	readonly enums: Enums
}

/** What the plugin holds while the application runs. */
export interface Running {
	/** `undefined` without keys: every call throws `PAYMENT_UNAVAILABLE`. */
	readonly stripe:
		| {
				readonly gateway: Gateway
				/** Verifies the webhook's events; it reaches no network. */
				readonly client: Stripe
				readonly webhook: string
				readonly live: boolean
		  }
		| undefined
	readonly catalog: Catalog
	readonly products: ReadonlyMap<string, Product>
	readonly customer: ((payer: never) => CustomerProfile) | undefined
	readonly oneSubscription: boolean
	readonly risk: RiskOptions
	readonly subscription: Billing | undefined
	readonly purchase: Billing | undefined
	readonly balance: Billing | undefined
	readonly history: Billing | undefined
	readonly logger: Logger
	/** The managed portal configuration's id, once read. */
	portal: string | null | undefined
}

let running: Running | undefined

export const useRunning = (state: Running | undefined): void => {
	running = state
}

/** The running plugin; a call before the application starts is a bug. */
export function runningOf(entry: string): Running {
	if (running === undefined) {
		throw new Error(
			`${entry} runs while an application with stripePlugin() runs.`,
		)
	}
	return running
}

/** The queries of each payer model, by name. */
export const payersOf = (state: Running): ReadonlyMap<string, Rows> =>
	new Map(
		[state.subscription, state.purchase, state.balance].flatMap((billing) =>
			billing === undefined
				? []
				: [[billing.payer.name, billing.payer.queries] as const],
		),
	)

/** Whether `name` is one of the billing models, which only the plugin writes. */
export const isBilling = (state: Running, name: string): boolean =>
	[state.subscription, state.purchase, state.balance, state.history].some(
		(billing) => billing?.name === name,
	)

/** The gateway, or `PAYMENT_UNAVAILABLE` without keys (D-371). */
export function stripeOf(entry: string): NonNullable<Running['stripe']> {
	const { stripe } = runningOf(entry)
	if (stripe === undefined) throw unavailable()
	return stripe
}

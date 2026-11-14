// The catalog a client reads (D-392): `stripeCatalog`, the public query the
// `catalog` option adds, and `stripe.catalog()` on the server, both from the
// code the deploy script keeps Stripe equal to.
import type { Enum, ExposedModel, FunctionShape } from 'ultimabase'
import { allow, defineFunction, Refused } from 'ultimabase'
import type { CreditAmount } from './credit.ts'
import type { Kind } from './kinds.ts'
import { billingModels } from './kinds.ts'
import type { Every } from './product.ts'
import { runningOf } from './running.ts'

/** A subscription's price, as a pricing page shows it. */
export interface CatalogPrice {
	readonly name: string
	/** In the currency's smallest unit. */
	readonly amount: number
	readonly currency: string
	readonly every: Every
	readonly everyCount: number
	/** `null` without a trial (D-391). */
	readonly trialDays: number | null
	readonly gives: readonly CreditAmount[]
}

/** The catalog, in its declared order (D-392). */
export interface CatalogView {
	readonly subscriptions: readonly {
		readonly key: string
		readonly name: string
		readonly prices: readonly CatalogPrice[]
	}[]
	readonly purchases: readonly {
		readonly key: string
		readonly name: string
		readonly amount: number
		readonly currency: string
		readonly gives: readonly CreditAmount[]
	}[]
}

const credits = (gives: readonly CreditAmount[] = []) =>
	gives.map(({ credit, amount }) => ({ credit, amount }))

/** The running catalog, as the query returns it. */
export function catalog(): CatalogView {
	const { currency, products } = runningOf('stripe.catalog').catalog
	const plans = products.flatMap((one) => ('prices' in one ? [one] : []))
	const once = products.flatMap((one) => ('prices' in one ? [] : [one]))
	return {
		subscriptions: plans.map(({ key, name, prices }) => ({
			key,
			name,
			prices: Object.entries(prices).map(([price, declared]) => ({
				name: price,
				amount: declared.amount,
				currency,
				every: declared.every,
				everyCount: declared.everyCount ?? 1,
				trialDays: declared.trialDays ?? null,
				gives: credits(declared.gives),
			})),
		})),
		purchases: once.map(({ key, name, price, gives }) => ({
			key,
			name,
			amount: price.amount,
			currency,
			gives: credits(gives),
		})),
	}
}

/** Standard Schema with its JSON Schema export (standardschema.dev). */
interface StandardSchema<T> {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => { readonly value: T }
		readonly jsonSchema: {
			readonly input: () => object
			readonly output: () => object
		}
		readonly types?: { readonly input: T; readonly output: T }
	}
}

/** An output's JSON Schema: typed by its function, never validated (D-45). */
function schemaOf<T>(node: object): StandardSchema<T> {
	const json = (): object => node
	return {
		'~standard': Object.freeze({
			version: 1,
			vendor: 'ultimabase-stripe',
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an output is typed by its function, never validated (D-45).
			validate: (value: unknown) => ({ value: value as T }),
			jsonSchema: { input: json, output: json },
		}),
	}
}

const text = { type: 'string' }
const int = { type: 'integer' }
const list = (name: string) => ({
	type: 'array',
	items: { $ref: `#/$defs/${name}` },
})
/** An object of these required fields. */
const object = (properties: object, description?: string) => ({
	type: 'object',
	description,
	properties,
	required: Object.keys(properties),
})
/** A key the model's enum names, else a string (D-387). */
const keyOf = (typed: Enum | undefined) =>
	typed === undefined ? text : { $ref: `#/$defs/${typed.name}` }

/**
 * The catalog's JSON Schema, its types named by `$defs`: one schema, whose
 * lists count values, not rows, as the code bounds them.
 */
function catalogSchema(models: readonly ExposedModel[]): object {
	const enums = (kind: Kind) =>
		models
			.map(({ queries }) => billingModels.get(queries))
			.find((declared) => declared?.kind === kind)?.enums ?? {}
	const subscription = enums('subscription')
	const purchase = enums('purchase')
	const typed = [subscription.product, subscription.price, purchase.product]
	const defs = {
		...Object.fromEntries(
			typed.flatMap((one) => {
				if (one === undefined) return []
				const { name, values, description } = one
				return [[name, { type: 'string', enum: values, description }]]
			}),
		),
		StripeEvery: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
		StripeCreditAmount: object({ credit: text, amount: int }),
		StripeRecurringPrice: object({
			name: keyOf(subscription.price),
			amount: int,
			currency: text,
			every: { $ref: '#/$defs/StripeEvery' },
			everyCount: int,
			trialDays: { type: ['integer', 'null'] },
			gives: list('StripeCreditAmount'),
		}),
		StripeSubscriptionProduct: object({
			key: keyOf(subscription.product),
			name: text,
			prices: list('StripeRecurringPrice'),
		}),
		StripeOneTimeProduct: object({
			key: keyOf(purchase.product),
			name: text,
			amount: int,
			currency: text,
			gives: list('StripeCreditAmount'),
		}),
		StripeCatalog: object(
			{
				subscriptions: list('StripeSubscriptionProduct'),
				purchases: list('StripeOneTimeProduct'),
			},
			'The products on sale, in their declared order.',
		),
	}
	return { $ref: '#/$defs/StripeCatalog', $defs: defs }
}

/** The query `stripeCatalog` with `catalog: true`, else none (D-392). */
export function catalogFunctions(
	option: unknown,
	models: readonly ExposedModel[],
): readonly FunctionShape[] {
	if (option === undefined || option === false) return []
	if (option !== true) {
		throw new Refused('stripePlugin: catalog is true or false.')
	}
	const query = defineFunction({
		name: 'stripeCatalog',
		description: 'The products on sale and their prices.',
		query: true,
		output: schemaOf<CatalogView>(catalogSchema(models)),
		run: catalog,
	})
	return [query.with({ access: allow.public })]
}

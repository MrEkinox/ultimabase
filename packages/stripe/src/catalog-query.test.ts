// The catalog a client reads (D-392): `stripeCatalog` over GraphQL and
// REST with `catalog: true`, typed by the models' enums, served from the code
// without keys, and absent without the option.
import { describe, expect, it } from 'vitest'
import { stripe } from './index.ts'
import { billingApp, billingTest } from './test/billing-app.ts'

const gems = (amount: number) => [{ credit: 'gems', amount }]

const expected = {
	subscriptions: [
		{
			key: 'pro',
			name: 'Pro',
			prices: [
				{
					name: 'monthly',
					amount: 990,
					currency: 'eur',
					every: 'month',
					everyCount: 1,
					trialDays: null,
					gives: gems(100),
				},
				{
					name: 'yearly',
					amount: 9900,
					currency: 'eur',
					every: 'year',
					everyCount: 1,
					trialDays: 30,
					gives: gems(1200),
				},
			],
		},
		{
			key: 'team',
			name: 'Team',
			prices: [
				{
					name: 'monthly',
					amount: 2900,
					currency: 'eur',
					every: 'month',
					everyCount: 1,
					trialDays: null,
					gives: [],
				},
			],
		},
	],
	purchases: [
		{
			key: 'gemPack',
			name: '500 gems',
			amount: 490,
			currency: 'eur',
			gives: gems(500),
		},
	],
}

const selection = `{ stripeCatalog {
	subscriptions { key name prices {
		name amount currency every everyCount trialDays gives { credit amount }
	} }
	purchases { key name amount currency gives { credit amount } }
} }`

async function graphql(url: string, query: string): Promise<unknown> {
	const response = await fetch(`${url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	return response.json()
}

/** A field's type as GraphQL prints it, such as `Plan!` or `[X!]!`. */
const printed = (type: unknown): string => {
	if (typeof type !== 'object' || type === null) return ''
	const kind: unknown = Reflect.get(type, 'kind')
	const name: unknown = Reflect.get(type, 'name')
	const inner: unknown = Reflect.get(type, 'ofType')
	if (kind === 'NON_NULL') return `${printed(inner)}!`
	if (kind === 'LIST') return `[${printed(inner)}]`
	return typeof name === 'string' ? name : ''
}

const kinded = 'kind name'
const typeOf = `${kinded} ofType { ${kinded} ofType { ${kinded} ofType { ${kinded} } } }`

/** Each field of a GraphQL type, by name, with its printed type. */
async function fieldsOf(
	url: string,
	type: string,
): Promise<Record<string, string>> {
	const answer = await graphql(
		url,
		`{ __type(name: "${type}") { fields { name type { ${typeOf} } } } }`,
	)
	const list: unknown = Reflect.get(
		Reflect.get(Reflect.get(Object(answer), 'data'), '__type'),
		'fields',
	)
	if (!Array.isArray(list)) throw new Error(`No type ${type}.`)
	return Object.fromEntries(
		list.map((field: unknown) => [
			String(Reflect.get(Object(field), 'name')),
			printed(Reflect.get(Object(field), 'type')),
		]),
	)
}

describe('with catalog: true', () => {
	const { app } = billingApp({ catalog: true }, true)
	const test = billingTest(app)

	it('serves the catalog over GraphQL and REST, as stripe.catalog()', async () => {
		expect(await graphql(test.url, selection)).toStrictEqual({
			data: { stripeCatalog: expected },
		})
		const response = await fetch(`${test.url}/api/functions/stripeCatalog`)
		expect(response.status).toBe(200)
		expect(await response.json()).toStrictEqual(expected)
		expect(stripe.catalog()).toStrictEqual(expected)
	})

	it('types the keys and price names by the models’ enums', async () => {
		expect(await fieldsOf(test.url, 'StripeSubscriptionProduct')).toStrictEqual(
			{ key: 'Plan!', name: 'String!', prices: '[StripeRecurringPrice!]!' },
		)
		expect(await fieldsOf(test.url, 'StripeRecurringPrice')).toMatchObject({
			name: 'Period!',
			every: 'StripeEvery!',
			trialDays: 'Int',
		})
		expect(await fieldsOf(test.url, 'StripeOneTimeProduct')).toMatchObject({
			key: 'Pack!',
		})
	})
})

describe('with catalog: true and no keys', () => {
	const { app } = billingApp({ catalog: true, keys: undefined }, true)
	const test = billingTest(app)

	it('serves the catalog from the code', async () => {
		const response = await fetch(`${test.url}/api/functions/stripeCatalog`)
		expect(await response.json()).toStrictEqual(expected)
	})
})

describe('without the option', () => {
	const { app } = billingApp({}, true)
	const test = billingTest(app)

	it('serves no catalog query', async () => {
		expect(await graphql(test.url, selection)).toMatchObject({
			errors: [
				{ message: 'Cannot query field "stripeCatalog" on type "Query".' },
			],
		})
		const response = await fetch(`${test.url}/api/functions/stripeCatalog`)
		expect(response.status).toBe(404)
	})
})

// Places orders as a client would, over GraphQL, each test on a new
// in-memory database stocked by the server.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Product } from './models.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

/** Three teas and one kettle, stocked as Master; returns their ids. */
async function stocked() {
	const as = { as: master }
	const tea = await Product.create({ data: { name: 'Tea', stock: 3 } }, as)
	const kettle = await Product.create(
		{ data: { name: 'Kettle', stock: 1 } },
		as,
	)
	return { tea: tea.id, kettle: kettle.id }
}

const place = `mutation ($lines: [LineInput!]!) {
	placeOrder(lines: $lines) { quantity product { name stock } }
}`
const stock =
	'{ products(orderBy: [{ name: asc }]) { edges { node { name stock } } } }'

it('places every line of an order, each taking from the stock', async () => {
	const { tea, kettle } = await stocked()
	const lines = [
		{ product: tea, quantity: 2 },
		{ product: kettle, quantity: 1 },
	]
	expect(await request(place, { lines })).toEqual({
		data: {
			placeOrder: [
				{ quantity: 2, product: { name: 'Tea', stock: 1 } },
				{ quantity: 1, product: { name: 'Kettle', stock: 0 } },
			],
		},
	})
})

it('places no line when one is out of stock', async () => {
	const { tea, kettle } = await stocked()
	const lines = [
		{ product: tea, quantity: 2 },
		{ product: kettle, quantity: 2 },
	]
	expect(await request(place, { lines })).toMatchObject({
		errors: [
			{
				message: 'Kettle is out of stock.',
				extensions: { code: 'OUT_OF_STOCK' },
			},
		],
	})
	// The tea line was rolled back with the kettle's.
	expect(await request(stock)).toEqual({
		data: {
			products: {
				edges: [
					{ node: { name: 'Kettle', stock: 1 } },
					{ node: { name: 'Tea', stock: 3 } },
				],
			},
		},
	})
	expect(await request('{ orders { totalCount } }')).toEqual({
		data: { orders: { totalCount: 0 } },
	})
})

it('refuses an order no client may write, and an empty one', async () => {
	const { tea } = await stocked()
	const direct = await request(
		`mutation ($tea: ID!) {
			createOrder(data: { product: { connect: { id: $tea } }, quantity: 1 }) { id }
		}`,
		{ tea },
	)
	expect(direct).toMatchObject({
		errors: [{ extensions: { code: 'ACCESS_DENIED' } }],
	})
	expect(await request(place, { lines: [] })).toMatchObject({
		errors: [{ extensions: { code: 'VALIDATION_FAILED' } }],
	})
})

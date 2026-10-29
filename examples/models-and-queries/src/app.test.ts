// Uses the catalog over GraphQL, as a client would, each test on a new
// in-memory database.
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'
import { app } from './app.ts'

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

it('creates and reads a product over GraphQL', async () => {
	//#region graphql
	const body = await request(`mutation {
		createProduct(data: {
			name: "Desk lamp"
			sku: "LMP-001"
			price: "39.90"
			status: published
			releasedOn: "2026-03-01"
			sizes: [S, M]
			specs: { color: "black", materials: ["steel"] }
		}) {
			name price status releasedOn sizes specs { color materials } label
			priceIn(currency: USD) { amount currency }
		}
	}`)
	expect(body).toEqual({
		data: {
			createProduct: {
				name: 'Desk lamp',
				price: '39.90',
				status: 'published',
				releasedOn: '2026-03-01',
				sizes: ['S', 'M'],
				specs: { color: 'black', materials: ['steel'] },
				label: 'Desk lamp (LMP-001)',
				priceIn: { amount: '43.89', currency: 'USD' },
			},
		},
	})
	//#endregion
	//#region private
	// A field only Master reads is not in the schema.
	const hidden = await request('{ products { edges { node { cost } } } }')
	expect(hidden).toMatchObject({
		errors: [{ message: 'Cannot query field "cost" on type "Product".' }],
	})
	//#endregion
})

// @ultimabase/stripe/testing (D-371 point 8): a Stripe account in memory.
// Its secret key reaches it wherever a real key reaches Stripe, so a test
// runs the application's own calls, and no test reaches Stripe.
import { addFake } from './accounts.ts'
import type {
	PortalSettings,
	StripeGateway,
	StripePrice,
	StripeProduct,
} from './gateway.ts'

export type { PortalSettings, StripePrice, StripeProduct } from './gateway.ts'

/** A Stripe account in memory, with what the catalog wrote to it. */
export interface FakeStripe {
	/** Its secret key: hand it to the code under test. */
	readonly secret: string
	/** The products the catalog manages, by id. */
	readonly products: Map<string, StripeProduct>
	/** The prices, by id. */
	readonly prices: Map<string, StripePrice>
	/** The customer portal configurations, by id. */
	readonly portals: Map<string, PortalSettings>
}

/** The record of `map` at `id`, or Stripe's answer to an unknown id. */
const found = <T>(map: ReadonlyMap<string, T>, id: string): T => {
	const record = map.get(id)
	if (record === undefined) throw new Error(`No such object: '${id}'.`)
	return record
}

/** A new Stripe account in memory; `secret` reaches it. */
export const fakeStripe = (): FakeStripe => {
	const fake: FakeStripe = {
		secret: `sk_test_fake_${crypto.randomUUID()}`,
		products: new Map(),
		prices: new Map(),
		portals: new Map(),
	}
	const { products, prices, portals } = fake
	let created = 0
	const newId = (prefix: string): string => {
		created += 1
		return `${prefix}_${String(created)}`
	}
	const gateway: StripeGateway = {
		readCatalog: async () => {
			const [portal] = portals
			return {
				products: [...products.values()],
				prices: [...prices.values()],
				portal:
					portal === undefined ? null : { id: portal[0], settings: portal[1] },
			}
		},
		createProduct: async ({ key, name, taxCode }) => {
			const id = newId('prod')
			products.set(id, { id, key, name, active: true, taxCode })
			return id
		},
		updateProduct: async (id, { key, name, taxCode }) => {
			products.set(id, {
				...found(products, id),
				key,
				name,
				taxCode,
				active: true,
			})
		},
		archiveProduct: async (id) => {
			products.set(id, { ...found(products, id), active: false })
		},
		createPrice: async (price) => {
			found(products, price.productId)
			// `transfer_lookup_key`: the key leaves the price that held it.
			for (const held of prices.values()) {
				if (held.lookupKey === price.lookupKey) {
					prices.set(held.id, { ...held, lookupKey: null })
				}
			}
			const id = newId('price')
			prices.set(id, {
				id,
				productId: price.productId,
				lookupKey: price.lookupKey,
				amount: price.amount,
				currency: price.currency,
				recurring: price.recurring,
				taxBehavior: price.taxBehavior,
				nickname: price.nickname,
				active: true,
				metadata: { ...price.metadata },
			})
			return id
		},
		updatePrice: async (id, { nickname, metadata }) => {
			const held = found(prices, id)
			// Stripe merges the metadata it is sent.
			const merged = { ...held.metadata, ...metadata }
			prices.set(id, { ...held, nickname, metadata: merged })
		},
		archivePrice: async (id) => {
			prices.set(id, { ...found(prices, id), active: false })
		},
		savePortal: async (id, settings) => {
			if (id !== null) found(portals, id)
			const saved = id ?? newId('bpc')
			portals.set(saved, settings)
			return saved
		},
	}
	addFake(fake.secret, gateway)
	return fake
}

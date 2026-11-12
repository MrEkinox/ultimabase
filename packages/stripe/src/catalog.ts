// The catalog at Stripe, written from the products declared in code (D-372).
// A product is found by its `metadata.key`, a price by its lookup key:
// `<product>.<price>`, or the product's key for a one-time price. The plan
// lists the changes from what Stripe holds; applying them never deletes: a
// product left out is archived, and a price whose billing changed is
// replaced by a new one, which takes its lookup key over.
import { Refused } from 'ultimabase'
import {
	type CatalogState,
	type PortalProduct,
	type ProductWrite,
	type Recurring,
	type StripeGateway,
	type StripePrice,
	type StripeProduct,
	managedBy,
} from './gateway.ts'
import { type PortalOptions, portalSettings, samePortal } from './portal.ts'
import type { Every, Product } from './product.ts'

/** What an application sells, and how its payers manage it. */
export interface Catalog {
	/** Every price's currency, in lowercase: `eur`. */
	readonly currency: string
	/** Whether the amounts include the taxes. */
	readonly taxBehavior: 'inclusive' | 'exclusive'
	readonly products: readonly Product[]
	readonly portal: PortalOptions
}

/** A price as the catalog wants it. */
export interface WantedPrice {
	/** Its product's key. */
	readonly product: string
	readonly lookupKey: string
	readonly amount: number
	/** `null` for a one-time price. */
	readonly recurring: Recurring<Every> | null
	readonly metadata: Readonly<Record<string, string>>
}

/** One change to the catalog. */
export type CatalogStep =
	| { readonly kind: 'createProduct'; readonly product: ProductWrite }
	| {
			readonly kind: 'updateProduct'
			readonly product: ProductWrite
			readonly was: StripeProduct
	  }
	| { readonly kind: 'archiveProduct'; readonly was: StripeProduct }
	| {
			readonly kind: 'createPrice'
			readonly price: WantedPrice
			/** The price whose lookup key it takes over, archived after. */
			readonly replaces: StripePrice | null
	  }
	| {
			readonly kind: 'updatePrice'
			readonly price: WantedPrice
			readonly was: StripePrice
	  }
	| { readonly kind: 'archivePrice'; readonly was: StripePrice }
	| { readonly kind: 'savePortal'; readonly id: string | null }

const productWrite = (product: Product): ProductWrite => ({
	key: product.key,
	name: product.name,
	taxCode: product.taxCode ?? null,
})

/** The prices of the catalog's products, in their order. */
const wantedPrices = (products: readonly Product[]): WantedPrice[] =>
	products.flatMap((product): WantedPrice[] =>
		'prices' in product
			? Object.entries(product.prices).map(([name, price]) => ({
					product: product.key,
					lookupKey: `${product.key}.${name}`,
					amount: price.amount,
					recurring: { every: price.every, count: price.everyCount ?? 1 },
					metadata: { managedBy, product: product.key, price: name },
				}))
			: [
					{
						product: product.key,
						lookupKey: product.key,
						amount: product.price.amount,
						recurring: null,
						metadata: { managedBy, product: product.key },
					},
				],
	)

/** The product of each key: its active one first, else an archived one. */
const productsOf = (
	products: readonly Product[],
	held: readonly StripeProduct[],
): Map<string, StripeProduct> =>
	new Map(
		products.flatMap(({ key }) => {
			const ofKey = held.filter((product) => product.key === key)
			const product = ofKey.find(({ active }) => active) ?? ofKey.at(0)
			return product === undefined ? [] : [[key, product] as const]
		}),
	)

const sameRecurring = (
	held: Recurring | null,
	wanted: Recurring | null,
): boolean =>
	held === null || wanted === null
		? held === wanted
		: held.every === wanted.every && held.count === wanted.count

/** Whether `held` bills as `price`: what Stripe never changes of a price. */
const billsAs = (
	catalog: Catalog,
	held: StripePrice,
	price: WantedPrice,
	productId: string | undefined,
): boolean =>
	held.productId === productId &&
	held.amount === price.amount &&
	held.currency === catalog.currency &&
	sameRecurring(held.recurring, price.recurring) &&
	held.taxBehavior === catalog.taxBehavior

/** Whether `held` carries `price`'s nickname and metadata. */
const describedAs = (held: StripePrice, price: WantedPrice): boolean =>
	held.nickname === price.lookupKey &&
	// Stripe merges metadata: a key someone added stays, and is let be.
	Object.entries(price.metadata).every(
		([key, value]) => held.metadata[key] === value,
	)

const productIs = (held: StripeProduct, product: ProductWrite): boolean =>
	held.active && held.name === product.name && held.taxCode === product.taxCode

/** The active price of each lookup key. */
const activePrices = (
	prices: readonly StripePrice[],
): Map<string, StripePrice> =>
	new Map(
		prices.flatMap((price) =>
			price.active && price.lookupKey !== null
				? [[price.lookupKey, price] as const]
				: [],
		),
	)

/** The id `ids` holds for `key`, which the steps before have written. */
const idOf = (ids: ReadonlyMap<string, string>, key: string): string => {
	const id = ids.get(key)
	if (id === undefined) throw new Error(`The catalog has no id for ${key}.`)
	return id
}

/** The portal's products: the subscriptions, with their prices' ids. */
const portalProducts = (
	products: readonly Product[],
	productIds: ReadonlyMap<string, string>,
	priceIds: ReadonlyMap<string, string>,
): PortalProduct[] =>
	products.flatMap((product) =>
		'prices' in product
			? [
					{
						productId: idOf(productIds, product.key),
						priceIds: Object.keys(product.prices).map((name) =>
							idOf(priceIds, `${product.key}.${name}`),
						),
					},
				]
			: [],
	)

/** The id of each key's product. */
const productIdsOf = (
	products: readonly Product[],
	held: readonly StripeProduct[],
): Map<string, string> =>
	new Map(
		[...productsOf(products, held)].map(([key, { id }]) => [key, id] as const),
	)

/** The changes that bring `state` to `catalog`, in order. */
export const planCatalog = (
	catalog: Catalog,
	state: CatalogState,
): CatalogStep[] => {
	const steps: CatalogStep[] = []
	const kept = productsOf(catalog.products, state.products)
	for (const product of catalog.products.map(productWrite)) {
		const was = kept.get(product.key)
		if (was === undefined) steps.push({ kind: 'createProduct', product })
		else if (!productIs(was, product)) {
			steps.push({ kind: 'updateProduct', product, was })
		}
	}
	const active = activePrices(state.prices)
	const unchanged = new Map<string, string>()
	const wanted = wantedPrices(catalog.products)
	for (const price of wanted) {
		const was = active.get(price.lookupKey)
		if (was !== undefined && was.metadata['managedBy'] !== managedBy) {
			throw new Refused(
				`The price ${was.id} holds the lookup key ${price.lookupKey} but was not written by the catalog: archive it, or remove its lookup key, in the Stripe Dashboard.`,
			)
		}
		if (was === undefined) {
			steps.push({ kind: 'createPrice', price, replaces: null })
		} else if (!billsAs(catalog, was, price, kept.get(price.product)?.id)) {
			// A price's billing never changes: a new one takes the key over.
			steps.push({ kind: 'createPrice', price, replaces: was })
		} else {
			unchanged.set(price.lookupKey, was.id)
			if (!describedAs(was, price)) {
				steps.push({ kind: 'updatePrice', price, was })
			}
		}
	}
	const lookupKeys = new Set(wanted.map(({ lookupKey }) => lookupKey))
	for (const price of state.prices) {
		if (
			price.active &&
			price.metadata['managedBy'] === managedBy &&
			(price.lookupKey === null || !lookupKeys.has(price.lookupKey))
		) {
			steps.push({ kind: 'archivePrice', was: price })
		}
	}
	// A product left out, or a key's second product.
	const keptIds = new Set([...kept.values()].map(({ id }) => id))
	for (const product of state.products) {
		if (product.active && !keptIds.has(product.id)) {
			steps.push({ kind: 'archiveProduct', was: product })
		}
	}
	// A new subscription price changes the portal's list.
	const moved = steps.some(
		(step) => step.kind === 'createPrice' && step.price.recurring !== null,
	)
	if (
		moved ||
		state.portal === null ||
		!samePortal(
			state.portal.settings,
			portalSettings(
				catalog.portal,
				portalProducts(
					catalog.products,
					productIdsOf(catalog.products, state.products),
					unchanged,
				),
			),
		)
	) {
		steps.push({ kind: 'savePortal', id: state.portal?.id ?? null })
	}
	return steps
}

/** Applies `steps`, planned from `state`, through `gateway`. */
export const applyCatalog = async (
	catalog: Catalog,
	gateway: StripeGateway,
	state: CatalogState,
	steps: readonly CatalogStep[],
): Promise<void> => {
	const productIds = productIdsOf(catalog.products, state.products)
	const priceIds = new Map(
		[...activePrices(state.prices)].map(([key, { id }]) => [key, id] as const),
	)
	for (const step of steps) {
		switch (step.kind) {
			case 'createProduct':
				productIds.set(
					step.product.key,
					await gateway.createProduct(step.product),
				)
				break
			case 'updateProduct':
				await gateway.updateProduct(step.was.id, step.product)
				break
			case 'archiveProduct':
				await gateway.archiveProduct(step.was.id)
				break
			case 'createPrice': {
				const { price } = step
				const id = await gateway.createPrice({
					productId: idOf(productIds, price.product),
					lookupKey: price.lookupKey,
					amount: price.amount,
					currency: catalog.currency,
					recurring: price.recurring,
					taxBehavior: catalog.taxBehavior,
					nickname: price.lookupKey,
					metadata: price.metadata,
				})
				priceIds.set(price.lookupKey, id)
				// After its successor: a payer never finds no price.
				if (step.replaces !== null) {
					await gateway.archivePrice(step.replaces.id)
				}
				break
			}
			case 'updatePrice':
				await gateway.updatePrice(step.was.id, {
					nickname: step.price.lookupKey,
					metadata: step.price.metadata,
				})
				break
			case 'archivePrice':
				await gateway.archivePrice(step.was.id)
				break
			case 'savePortal': {
				await gateway.savePortal(
					step.id,
					portalSettings(
						catalog.portal,
						portalProducts(catalog.products, productIds, priceIds),
					),
				)
				break
			}
		}
	}
}

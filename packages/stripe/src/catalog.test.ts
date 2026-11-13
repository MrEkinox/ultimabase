// The catalog (D-372 point 3): the plan from what Stripe holds, its
// application on a fake account, and the plan of that account again, which
// is empty. Nothing is deleted; a changed price is replaced.
import { describe, expect, it } from 'vitest'
import { gatewayOf } from './accounts.ts'
import { type Catalog, applyCatalog, planCatalog } from './catalog.ts'
import { defineCredit } from './credit.ts'
import { describeStep } from './describe.ts'
import type { StripePrice } from './gateway.ts'
import { defineProduct } from './product.ts'
import { type FakeStripe, fakeStripe } from './testing.ts'

const blueGems = defineCredit({ key: 'blueGems' })

const pro = defineProduct({
	key: 'pro',
	name: 'Pro',
	taxCode: 'txcd_10103000',
	prices: {
		monthly: { amount: 9_90, every: 'month' },
		yearly: { amount: 99_00, every: 'year' },
	},
})

const gems = defineProduct({
	key: 'gems500',
	name: '500 blue gems',
	price: { amount: 4_99 },
	gives: [blueGems(500)],
})

const catalog: Catalog = {
	currency: 'eur',
	taxBehavior: 'inclusive',
	products: [pro, gems],
	portal: { returnUrl: 'https://app.test/shop' },
}

/** The plan of `fake` to `wanted`. */
const plan = async (fake: FakeStripe, wanted: Catalog = catalog) =>
	planCatalog(wanted, await gatewayOf(fake.secret).readCatalog())

/** Applies `wanted` to `fake`; returns the plan's lines. */
const apply = async (fake: FakeStripe, wanted: Catalog = catalog) => {
	const gateway = gatewayOf(fake.secret)
	const state = await gateway.readCatalog()
	const steps = planCatalog(wanted, state)
	await applyCatalog(wanted, gateway, state, steps)
	return steps.map((step) => describeStep(step, wanted.currency))
}

/** The prices the plan of `fake` to `wanted` replaces, by id. */
const replaced = async (fake: FakeStripe, wanted: Catalog = catalog) =>
	(await plan(fake, wanted)).flatMap((step) =>
		step.kind === 'createPrice' ? [step.replaces?.id] : [],
	)

/** A fake account the catalog was applied to. */
const synced = async () => {
	const fake = fakeStripe()
	await apply(fake)
	return fake
}

const priceOf = (fake: FakeStripe, lookupKey: string): StripePrice => {
	const price = [...fake.prices.values()].find(
		(held) => held.active && held.lookupKey === lookupKey,
	)
	if (price === undefined) throw new Error(`No price ${lookupKey}.`)
	return price
}

describe('planCatalog and applyCatalog', () => {
	it('create everything on an empty account, and nothing after', async () => {
		const fake = fakeStripe()
		expect(await apply(fake)).toEqual([
			'create the product pro: "Pro"',
			'create the product gems500: "500 blue gems"',
			'create the price pro.monthly: 9.90 EUR every month',
			'create the price pro.yearly: 99.00 EUR every year',
			'create the price gems500: 4.99 EUR once',
			'create the customer portal configuration',
		])
		expect([...fake.products.values()]).toEqual([
			{
				id: 'prod_1',
				key: 'pro',
				name: 'Pro',
				active: true,
				taxCode: 'txcd_10103000',
			},
			{
				id: 'prod_2',
				key: 'gems500',
				name: '500 blue gems',
				active: true,
				taxCode: null,
			},
		])
		expect(priceOf(fake, 'pro.monthly')).toEqual({
			id: 'price_3',
			productId: 'prod_1',
			lookupKey: 'pro.monthly',
			amount: 9_90,
			currency: 'eur',
			recurring: { every: 'month', count: 1 },
			taxBehavior: 'inclusive',
			nickname: 'pro.monthly',
			active: true,
			metadata: { managedBy: 'ultimabase', product: 'pro', price: 'monthly' },
		})
		expect(priceOf(fake, 'gems500')).toMatchObject({
			productId: 'prod_2',
			recurring: null,
			metadata: { managedBy: 'ultimabase', product: 'gems500' },
		})
		// The portal lets a payer move between the subscriptions' prices only.
		expect(fake.portals.get('bpc_6')).toEqual({
			returnUrl: 'https://app.test/shop',
			termsUrl: null,
			privacyUrl: null,
			prorationBehavior: 'always_invoice',
			scheduleAtPeriodEnd: ['decreasing_item_amount', 'shortening_interval'],
			trialUpdate: 'end_trial',
			cancelMode: 'at_period_end',
			products: [{ productId: 'prod_1', priceIds: ['price_3', 'price_4'] }],
			active: true,
		})
		expect(await plan(fake)).toEqual([])
	})

	it('renames, and replaces a changed amount, which the portal lists', async () => {
		const fake = await synced()
		const changed = {
			...catalog,
			products: [
				defineProduct({
					key: 'pro',
					name: 'Pro plus',
					prices: {
						monthly: { amount: 12_90, every: 'month' },
						yearly: { amount: 99_00, every: 'year' },
					},
				}),
				gems,
			],
		}
		expect(await apply(fake, changed)).toEqual([
			'update the product pro: rename it from "Pro" to "Pro plus", set its tax code to none',
			'create the price pro.monthly: 12.90 EUR every month, replacing price_3 (9.90 EUR every month)',
			'update the customer portal configuration bpc_6',
		])
		// A subscriber keeps the old price, archived, and its key moved.
		expect(fake.prices.get('price_3')).toMatchObject({
			active: false,
			lookupKey: null,
			amount: 9_90,
		})
		expect(priceOf(fake, 'pro.monthly').id).toBe('price_7')
		expect(fake.portals.get('bpc_6')?.products).toEqual([
			{ productId: 'prod_1', priceIds: ['price_7', 'price_4'] },
		])
		expect(await plan(fake, changed)).toEqual([])
	})

	it('replaces a price whose interval count changed, and that one only', async () => {
		const fake = await synced()
		const held = priceOf(fake, 'pro.yearly')
		fake.prices.set(held.id, {
			...held,
			recurring: { every: 'year', count: 2 },
		})
		expect(await replaced(fake)).toEqual([held.id])
	})

	it('replaces a price held on another product, and that one only', async () => {
		const fake = await synced()
		const held = priceOf(fake, 'pro.monthly')
		fake.prices.set(held.id, { ...held, productId: 'prod_2' })
		expect(await replaced(fake)).toEqual([held.id])
	})

	it('replaces every price when the tax behavior changed', async () => {
		const fake = await synced()
		const ids = ['pro.monthly', 'pro.yearly', 'gems500'].map(
			(key) => priceOf(fake, key).id,
		)
		const exclusive = { ...catalog, taxBehavior: 'exclusive' } as const
		expect(new Set(await replaced(fake, exclusive))).toEqual(new Set(ids))
	})

	it('replaces a price whose currency changed', async () => {
		const fake = await synced()
		const once = defineProduct({
			key: 'gems500',
			name: '500 blue gems',
			price: { amount: 4_99 },
		})
		const usd = await plan(fake, {
			...catalog,
			currency: 'usd',
			products: [once],
		})
		expect(usd.map((step) => describeStep(step, 'usd'))).toContain(
			'create the price gems500: 4.99 USD once, replacing price_5 (4.99 EUR once)',
		)
	})

	it('restores the nickname and metadata of a price, and lets keys someone added be', async () => {
		const fake = await synced()
		const held = priceOf(fake, 'pro.monthly')
		fake.prices.set(held.id, {
			...held,
			nickname: 'Monthly',
			metadata: { managedBy: 'ultimabase', product: 'pro', note: 'promo' },
		})
		expect(await apply(fake)).toEqual([
			'update the nickname and metadata of the price pro.monthly (price_3)',
		])
		expect(fake.prices.get(held.id)?.metadata).toEqual({
			managedBy: 'ultimabase',
			product: 'pro',
			price: 'monthly',
			note: 'promo',
		})
		expect(await plan(fake)).toEqual([])
	})

	it('archives a product left out and its prices, and restores it when back', async () => {
		const fake = await synced()
		expect(await apply(fake, { ...catalog, products: [pro] })).toEqual([
			'archive the price gems500 (price_5)',
			'archive the product "500 blue gems" (prod_2)',
		])
		expect(fake.products.get('prod_2')?.active).toBe(false)
		expect(await apply(fake)).toEqual([
			'update the product gems500: restore it',
			'create the price gems500: 4.99 EUR once',
		])
		expect(fake.products.get('prod_2')?.active).toBe(true)
		expect(fake.prices.get('price_5')?.lookupKey).toBeNull()
		expect(await plan(fake)).toEqual([])
	})

	it('keeps the active product of a key, and archives a second one and a stray price', async () => {
		const fake = await synced()
		fake.products.set('prod_old', {
			id: 'prod_old',
			key: 'pro',
			name: 'Pro',
			active: true,
			taxCode: null,
		})
		fake.products.set('prod_none', {
			id: 'prod_none',
			key: null,
			name: 'Nameless',
			active: true,
			taxCode: null,
		})
		const held = priceOf(fake, 'pro.monthly')
		fake.prices.set('price_stray', {
			...held,
			id: 'price_stray',
			lookupKey: null,
		})
		fake.prices.set('price_other', {
			...held,
			id: 'price_other',
			lookupKey: null,
			metadata: {},
		})
		expect(await apply(fake)).toEqual([
			'archive the price price_stray',
			'archive the product "Pro" (prod_old)',
			'archive the product "Nameless" (prod_none)',
		])
		// A price the catalog did not write is let be.
		expect(fake.prices.get('price_other')?.active).toBe(true)
	})

	it('refuses to take a lookup key from a price it did not write', async () => {
		const fake = fakeStripe()
		fake.prices.set('price_hand', {
			id: 'price_hand',
			productId: 'prod_hand',
			lookupKey: 'pro.monthly',
			amount: 9_90,
			currency: 'eur',
			recurring: { every: 'month', count: 1 },
			taxBehavior: 'inclusive',
			nickname: null,
			active: true,
			metadata: {},
		})
		await expect(plan(fake)).rejects.toThrow(
			'The price price_hand holds the lookup key pro.monthly but was not written by the catalog',
		)
	})

	it('saves the portal when its options change, or when none is saved', async () => {
		const fake = await synced()
		expect(
			await apply(fake, {
				...catalog,
				portal: {
					returnUrl: 'https://app.test/shop',
					termsUrl: 'https://app.test/terms',
					upgrades: 'nextInvoice',
					downgrades: 'now',
					trialChange: 'keepTrial',
					cancel: 'now',
				},
			}),
		).toEqual(['update the customer portal configuration bpc_6'])
		expect(fake.portals.get('bpc_6')).toMatchObject({
			termsUrl: 'https://app.test/terms',
			prorationBehavior: 'create_prorations',
			scheduleAtPeriodEnd: [],
			trialUpdate: 'continue_trial',
			cancelMode: 'immediately',
		})
		fake.portals.clear()
		expect(await plan(fake)).toEqual([{ kind: 'savePortal', id: null }])
	})

	it('lists every subscription in the portal, in any order', async () => {
		const team = defineProduct({
			key: 'team',
			name: 'Team',
			prices: { monthly: { amount: 29_00, every: 'month' } },
		})
		const fake = fakeStripe()
		await apply(fake, { ...catalog, products: [pro, team] })
		expect(fake.portals.get('bpc_6')?.products).toEqual([
			{ productId: 'prod_1', priceIds: ['price_3', 'price_4'] },
			{ productId: 'prod_2', priceIds: ['price_5'] },
		])
		expect(await plan(fake, { ...catalog, products: [team, pro] })).toEqual([])
	})

	it('fails, as Stripe does, on an object the account lacks', async () => {
		const gateway = gatewayOf(fakeStripe().secret)
		await expect(gateway.archivePrice('price_none')).rejects.toThrow(
			"No such object: 'price_none'.",
		)
	})

	it('refuses steps that name a product no step before created', async () => {
		const fake = fakeStripe()
		const gateway = gatewayOf(fake.secret)
		const state = await gateway.readCatalog()
		const steps = planCatalog(catalog, state).filter(
			({ kind }) => kind !== 'createProduct',
		)
		await expect(applyCatalog(catalog, gateway, state, steps)).rejects.toThrow(
			'The catalog has no id for pro.',
		)
	})
})

describe('describeStep', () => {
	it('tells an amount in the currency, and how often it bills', () => {
		const price = {
			product: 'pro',
			lookupKey: 'pro.quarterly',
			amount: 27_00,
			recurring: { every: 'month', count: 3 },
			metadata: {},
		} as const
		expect(
			describeStep({ kind: 'createPrice', price, replaces: null }, 'eur'),
		).toBe('create the price pro.quarterly: 27.00 EUR every 3 months')
		// A currency's own number of digits: none for JPY, three for BHD.
		const step = { kind: 'createPrice', price, replaces: null } as const
		expect(describeStep(step, 'jpy')).toBe(
			'create the price pro.quarterly: 2700 JPY every 3 months',
		)
		expect(describeStep(step, 'bhd')).toBe(
			'create the price pro.quarterly: 2.700 BHD every 3 months',
		)
		expect(
			describeStep(
				{
					kind: 'createPrice',
					price,
					replaces: {
						id: 'price_1',
						productId: 'prod_1',
						lookupKey: 'pro.quarterly',
						amount: null,
						currency: 'eur',
						recurring: null,
						taxBehavior: null,
						nickname: null,
						active: true,
						metadata: {},
					},
				},
				'eur',
			),
		).toBe(
			'create the price pro.quarterly: 27.00 EUR every 3 months, replacing price_1 (no amount once)',
		)
		expect(
			describeStep(
				{
					kind: 'updateProduct',
					product: { key: 'pro', name: 'Pro', taxCode: 'txcd_1' },
					was: {
						id: 'prod_1',
						key: 'pro',
						name: 'Pro',
						active: true,
						taxCode: null,
					},
				},
				'eur',
			),
		).toBe('update the product pro: set its tax code to txcd_1')
	})
})

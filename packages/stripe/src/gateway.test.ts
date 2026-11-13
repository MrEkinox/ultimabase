// The gateway over Stripe's API: what it reads of the catalog, and what it
// sends for each write, read on a client whose requests the test answers.
import { Stripe } from 'stripe'
import { describe, expect, it } from 'vitest'
import { gatewayOf } from './accounts.ts'
import { type PortalSettings, sdkGateway, stripeClient } from './gateway.ts'
import { stripeApi, stripeList } from './test/stripe-api.ts'
import { fakeStripe } from './testing.ts'

const settings: PortalSettings = {
	returnUrl: 'https://app.test/shop',
	termsUrl: 'https://app.test/terms',
	privacyUrl: null,
	prorationBehavior: 'always_invoice',
	scheduleAtPeriodEnd: ['decreasing_item_amount'],
	trialUpdate: 'end_trial',
	cancelMode: 'at_period_end',
	cancelReasons: ['too_expensive', 'other'],
	products: [{ productId: 'prod_1', priceIds: ['price_1', 'price_2'] }],
	active: true,
}

const product = (
	id: string,
	metadata: Record<string, string>,
	taxCode: unknown,
) => ({
	id,
	object: 'product',
	name: id,
	active: true,
	tax_code: taxCode,
	metadata,
})

const portal = (id: string, metadata: Record<string, string> | null) => ({
	id,
	object: 'billing_portal.configuration',
	active: true,
	default_return_url: 'https://app.test/shop',
	business_profile: { terms_of_service_url: null, privacy_policy_url: null },
	features: {
		subscription_update: {
			proration_behavior: 'always_invoice',
			schedule_at_period_end: { conditions: [{ type: 'shortening_interval' }] },
			trial_update_behavior: 'end_trial',
			products: [{ product: 'prod_1', prices: ['price_1'] }],
		},
		subscription_cancel: {
			mode: 'immediately',
			cancellation_reason: { enabled: true, options: ['unused'] },
		},
	},
	metadata,
})

describe('sdkGateway', () => {
	it('reads the managed products and portal, and every price, past their pages', async () => {
		const { client, requests } = stripeApi(({ path, params }) => {
			if (path === '/v1/products') {
				return params['starting_after'] === undefined
					? stripeList(
							[
								product(
									'prod_1',
									{ managedBy: 'ultimabase', key: 'pro' },
									'txcd_1',
								),
								product('prod_2', {}, null),
							],
							true,
						)
					: stripeList([
							product('prod_3', { managedBy: 'ultimabase' }, { id: 'txcd_2' }),
							product(
								'prod_4',
								{ managedBy: 'ultimabase', key: 'x' },
								undefined,
							),
						])
			}
			if (path === '/v1/prices') {
				return stripeList([
					{
						id: 'price_1',
						object: 'price',
						product: { id: 'prod_1' },
						lookup_key: 'pro.monthly',
						unit_amount: 990,
						currency: 'eur',
						recurring: { interval: 'month', interval_count: 1 },
						tax_behavior: 'inclusive',
						nickname: 'pro.monthly',
						active: true,
						metadata: { managedBy: 'ultimabase' },
					},
					{
						id: 'price_2',
						object: 'price',
						product: 'prod_2',
						lookup_key: null,
						unit_amount: 499,
						currency: 'eur',
						recurring: null,
						tax_behavior: 'unspecified',
						nickname: null,
						active: false,
						metadata: {},
					},
				])
			}
			return stripeList([
				portal('bpc_1', null),
				portal('bpc_2', { managedBy: 'ultimabase' }),
			])
		})
		const state = await sdkGateway(client).readCatalog()
		expect(state.products).toEqual([
			{
				id: 'prod_1',
				key: 'pro',
				name: 'prod_1',
				active: true,
				taxCode: 'txcd_1',
			},
			{
				id: 'prod_3',
				key: null,
				name: 'prod_3',
				active: true,
				taxCode: 'txcd_2',
			},
			{ id: 'prod_4', key: 'x', name: 'prod_4', active: true, taxCode: null },
		])
		expect(state.prices).toEqual([
			{
				id: 'price_1',
				productId: 'prod_1',
				lookupKey: 'pro.monthly',
				amount: 990,
				currency: 'eur',
				recurring: { every: 'month', count: 1 },
				taxBehavior: 'inclusive',
				nickname: 'pro.monthly',
				active: true,
				metadata: { managedBy: 'ultimabase' },
			},
			expect.objectContaining({
				id: 'price_2',
				productId: 'prod_2',
				recurring: null,
			}),
		])
		expect(state.portal).toEqual({
			id: 'bpc_2',
			settings: {
				returnUrl: 'https://app.test/shop',
				termsUrl: null,
				privacyUrl: null,
				prorationBehavior: 'always_invoice',
				scheduleAtPeriodEnd: ['shortening_interval'],
				trialUpdate: 'end_trial',
				cancelMode: 'immediately',
				cancelReasons: ['unused'],
				products: [{ productId: 'prod_1', priceIds: ['price_1'] }],
				active: true,
			},
		})
		expect(requests.map(({ path, params }) => [path, params])).toEqual(
			expect.arrayContaining([
				['/v1/products', { limit: '100', starting_after: 'prod_2' }],
				[
					'/v1/billing_portal/configurations',
					{
						limit: '100',
						'expand[0]': 'data.features.subscription_update.products',
					},
				],
			]),
		)
	})

	it('reads no portal, and a portal that lists no products', async () => {
		const unlisted = portal('bpc_1', { managedBy: 'ultimabase' })
		const { client } = stripeApi(({ path }) =>
			path === '/v1/billing_portal/configurations'
				? stripeList([
						{
							...unlisted,
							features: {
								...unlisted.features,
								subscription_update: {
									...unlisted.features.subscription_update,
									products: undefined,
								},
								// A disabled question keeps its options.
								subscription_cancel: {
									mode: 'immediately',
									cancellation_reason: { enabled: false, options: ['other'] },
								},
							},
						},
					])
				: stripeList([]),
		)
		const read = (await sdkGateway(client).readCatalog()).portal?.settings
		expect(read?.products).toBeNull()
		expect(read?.cancelReasons).toStrictEqual([])
		const none = stripeApi(() => stripeList([]))
		expect((await sdkGateway(none.client).readCatalog()).portal).toBeNull()
	})

	it('writes products and prices as managed, and never deletes', async () => {
		const { client, requests } = stripeApi(({ path }) => ({
			id: path.startsWith('/v1/products') ? 'prod_1' : 'price_1',
		}))
		const gateway = sdkGateway(client)
		expect(
			await gateway.createProduct({
				key: 'pro',
				name: 'Pro',
				taxCode: 'txcd_1',
			}),
		).toBe('prod_1')
		await gateway.createProduct({ key: 'gems', name: 'Gems', taxCode: null })
		await gateway.updateProduct('prod_1', {
			key: 'pro',
			name: 'Pro',
			taxCode: null,
		})
		await gateway.archiveProduct('prod_1')
		const price = {
			productId: 'prod_1',
			lookupKey: 'pro.monthly',
			amount: 990,
			currency: 'eur',
			recurring: { every: 'month', count: 3 },
			taxBehavior: 'inclusive',
			nickname: 'pro.monthly',
			metadata: { managedBy: 'ultimabase', product: 'pro', price: 'monthly' },
		} as const
		expect(await gateway.createPrice(price)).toBe('price_1')
		await gateway.createPrice({ ...price, lookupKey: 'gems', recurring: null })
		await gateway.updatePrice('price_1', {
			nickname: 'pro.monthly',
			metadata: { a: 'b' },
		})
		await gateway.archivePrice('price_1')
		expect(
			requests.map(({ method, path, params }) => [method, path, params]),
		).toEqual([
			[
				'POST',
				'/v1/products',
				{
					name: 'Pro',
					tax_code: 'txcd_1',
					'metadata[managedBy]': 'ultimabase',
					'metadata[key]': 'pro',
				},
			],
			[
				'POST',
				'/v1/products',
				{
					name: 'Gems',
					'metadata[managedBy]': 'ultimabase',
					'metadata[key]': 'gems',
				},
			],
			[
				'POST',
				'/v1/products/prod_1',
				{
					name: 'Pro',
					active: 'true',
					tax_code: '',
					'metadata[managedBy]': 'ultimabase',
					'metadata[key]': 'pro',
				},
			],
			['POST', '/v1/products/prod_1', { active: 'false' }],
			[
				'POST',
				'/v1/prices',
				{
					product: 'prod_1',
					currency: 'eur',
					unit_amount: '990',
					'recurring[interval]': 'month',
					'recurring[interval_count]': '3',
					tax_behavior: 'inclusive',
					lookup_key: 'pro.monthly',
					transfer_lookup_key: 'true',
					nickname: 'pro.monthly',
					'metadata[managedBy]': 'ultimabase',
					'metadata[product]': 'pro',
					'metadata[price]': 'monthly',
				},
			],
			[
				'POST',
				'/v1/prices',
				expect.not.objectContaining({ 'recurring[interval]': 'month' }),
			],
			[
				'POST',
				'/v1/prices/price_1',
				{ nickname: 'pro.monthly', 'metadata[a]': 'b' },
			],
			['POST', '/v1/prices/price_1', { active: 'false' }],
		])
	})

	it('creates the portal configuration, then updates it', async () => {
		const { client, requests } = stripeApi(() => ({ id: 'bpc_1' }))
		const gateway = sdkGateway(client)
		expect(await gateway.savePortal(null, settings)).toBe('bpc_1')
		await gateway.savePortal('bpc_1', {
			...settings,
			termsUrl: null,
			privacyUrl: 'https://app.test/privacy',
			returnUrl: null,
			products: null,
			scheduleAtPeriodEnd: [],
			cancelReasons: [],
		})
		const [created, updated] = requests
		expect(created?.path).toBe('/v1/billing_portal/configurations')
		expect(created?.params).toEqual({
			'business_profile[terms_of_service_url]': 'https://app.test/terms',
			default_return_url: 'https://app.test/shop',
			'features[subscription_update][enabled]': 'true',
			'features[subscription_update][default_allowed_updates][0]': 'price',
			'features[subscription_update][products][0][product]': 'prod_1',
			'features[subscription_update][products][0][prices][0]': 'price_1',
			'features[subscription_update][products][0][prices][1]': 'price_2',
			'features[subscription_update][proration_behavior]': 'always_invoice',
			'features[subscription_update][trial_update_behavior]': 'end_trial',
			'features[subscription_update][schedule_at_period_end][conditions][0][type]':
				'decreasing_item_amount',
			'features[subscription_cancel][enabled]': 'true',
			'features[subscription_cancel][mode]': 'at_period_end',
			'features[subscription_cancel][cancellation_reason][enabled]': 'true',
			'features[subscription_cancel][cancellation_reason][options][0]':
				'too_expensive',
			'features[subscription_cancel][cancellation_reason][options][1]': 'other',
			'features[payment_method_update][enabled]': 'true',
			'features[invoice_history][enabled]': 'true',
			'metadata[managedBy]': 'ultimabase',
		})
		// With no subscription to move to, the portal allows no update; an
		// empty string clears what Stripe would keep from an absent value.
		expect(updated?.path).toBe('/v1/billing_portal/configurations/bpc_1')
		expect(updated?.params).toMatchObject({
			'business_profile[terms_of_service_url]': '',
			'business_profile[privacy_policy_url]': 'https://app.test/privacy',
			'features[subscription_update][enabled]': 'false',
			'features[subscription_update][schedule_at_period_end][conditions]': '',
			'features[subscription_cancel][cancellation_reason][enabled]': 'false',
			'features[subscription_cancel][cancellation_reason][options]': '',
			active: 'true',
		})
		expect(updated?.params).not.toHaveProperty('default_return_url')
	})
})

describe('the account of a secret key', () => {
	it('is Stripe, through its SDK, unless a fake holds the key', () => {
		expect(stripeClient('sk_test_none')).toBeInstanceOf(Stripe)
		// The SDK's gateway does all a fake does: no call is left undefined.
		const sdk = new Set(Object.keys(gatewayOf('sk_test_none')))
		const fake = new Set(Object.keys(gatewayOf(fakeStripe().secret)))
		expect(sdk).toEqual(fake)
	})
})

// The billing gateway over Stripe's API: what it sends for a payer's
// customer, Checkouts and portal, what it reads of a customer, and how
// Stripe's errors become the plugin's; on a client the test answers.
import { describe, expect, it } from 'vitest'
import { Missing } from './billing-gateway.ts'
import { checkoutLocales, pageLocale, portalLocales } from './locale.ts'
import { sdkBilling } from './sdk-billing.ts'
import type { StripeRequest } from './test/stripe-api.ts'
import { stripeApi, stripeError, stripeList } from './test/stripe-api.ts'

const day = 24 * 60 * 60
const now = Math.floor(Date.now() / 1000)
const missing = () =>
	stripeError(404, { type: 'invalid_request_error', code: 'resource_missing' })
const down = () => stripeError(500, { type: 'api_error' })

/** The gateway on a client whose requests `answer` answers. */
const gatewayOn = (answer: (request: StripeRequest) => unknown) => {
	const { client, requests } = stripeApi(answer)
	return { gateway: sdkBilling(client), requests }
}

const price = (product: string, name: string) => ({
	id: `price_${product}_${name}`,
	object: 'price',
	metadata: { product, price: name },
	unit_amount: 9_90,
	recurring: { interval: 'month', interval_count: 3 },
})

const subscription = (fields: object) => ({
	id: 'sub_1',
	object: 'subscription',
	customer: 'cus_1',
	status: 'active',
	cancel_at: null,
	cancel_at_period_end: false,
	canceled_at: null,
	trial_end: null,
	start_date: now - day,
	schedule: null,
	metadata: {},
	default_payment_method: null,
	items: {
		object: 'list',
		data: [
			{
				id: 'si_1',
				quantity: 3,
				current_period_end: now + 29 * day,
				price: price('pro', 'monthly'),
			},
		],
	},
	...fields,
})

const intent = (id: string, fields: object) => ({
	id,
	object: 'payment_intent',
	customer: { id: 'cus_1', object: 'customer' },
	status: 'succeeded',
	amount_received: 4_90,
	created: now,
	metadata: { managedBy: 'ultimabase', product: 'gemPack' },
	latest_charge: {
		id: `ch_${id}`,
		amount_refunded: 0,
		disputed: false,
		receipt_url: `https://pay.stripe.com/receipts/ch_${id}`,
	},
	...fields,
})

describe('readCustomer', () => {
	it('reads the subscriptions and the paid payments the plugin opened', async () => {
		const { gateway, requests } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/customers/cus_1':
					return { id: 'cus_1', object: 'customer' }
				case '/v1/subscriptions':
					return stripeList([
						subscription({
							// The plugin's Checkout made it: its card moves.
							metadata: { managedBy: 'ultimabase' },
							default_payment_method: 'pm_1',
							cancel_at_period_end: true,
							schedule: {
								id: 'sub_sched_1',
								phases: [
									{ start_date: now - day, items: [{ price: 'price_x' }] },
									{
										start_date: now + 29 * day,
										items: [{ price: 'price_pro_yearly' }],
									},
								],
							},
						}),
						subscription({
							id: 'sub_2',
							status: 'canceled',
							// Made elsewhere: its card stays.
							default_payment_method: { id: 'pm_2' },
							canceled_at: now,
							trial_end: now - day,
							items: { object: 'list', data: [] },
							schedule: { id: 'sub_sched_2', phases: [] },
						}),
					])
				case '/v1/prices/price_pro_yearly':
					return price('pro', 'yearly')
				case '/v1/payment_intents':
					return stripeList([
						intent('pi_1', {}),
						intent('pi_2', {
							metadata: {
								managedBy: 'ultimabase',
								product: 'gemPack',
								quantity: '3',
							},
							latest_charge: {
								id: 'ch_2',
								amount_refunded: 1_00,
								disputed: true,
							},
						}),
						intent('pi_3', { status: 'requires_payment_method' }),
						intent('pi_4', { metadata: {} }),
					])
				case '/v1/disputes':
					return stripeList([{ id: 'dp_1', object: 'dispute', status: 'lost' }])
				default:
					throw new Error(path)
			}
		})
		const end = new Date((now + 29 * day) * 1000)
		expect(await gateway.readCustomer('cus_1')).toStrictEqual({
			invoices: [],
			deleted: false,
			subscriptions: [
				{
					id: 'sub_1',
					customerId: 'cus_1',
					priceId: 'price_pro_monthly',
					product: 'pro',
					price: 'monthly',
					status: 'active',
					quantity: 3,
					amount: 29_70,
					every: 'month',
					everyCount: 3,
					currentPeriodEnd: end,
					cancelAt: end,
					canceledAt: null,
					trialEnd: null,
					startedAt: new Date((now - day) * 1000),
					scheduled: { product: 'pro', price: 'yearly', at: end },
					card: 'pm_1',
				},
				{
					id: 'sub_2',
					customerId: 'cus_1',
					priceId: null,
					product: null,
					price: null,
					status: 'canceled',
					quantity: 1,
					amount: 0,
					every: 'month',
					everyCount: 1,
					currentPeriodEnd: new Date((now - day) * 1000),
					cancelAt: null,
					canceledAt: new Date(now * 1000),
					trialEnd: new Date((now - day) * 1000),
					startedAt: new Date((now - day) * 1000),
					scheduled: null,
					card: null,
				},
			],
			payments: [
				{
					id: 'pi_1',
					customerId: 'cus_1',
					product: 'gemPack',
					// A payment with no quantity written is one.
					quantity: 1,
					amount: 4_90,
					refunded: 0,
					disputeLost: false,
					paidAt: new Date(now * 1000),
					receiptUrl: 'https://pay.stripe.com/receipts/ch_pi_1',
				},
				{
					id: 'pi_2',
					customerId: 'cus_1',
					product: 'gemPack',
					quantity: 3,
					amount: 4_90,
					refunded: 1_00,
					disputeLost: true,
					paidAt: new Date(now * 1000),
					receiptUrl: null,
				},
			],
		})
		expect(
			requests.find(({ path }) => path === '/v1/subscriptions')?.params,
		).toMatchObject({
			customer: 'cus_1',
			status: 'all',
			'expand[0]': 'data.schedule',
		})
		expect(
			requests.find(({ path }) => path === '/v1/payment_intents')?.params,
		).toMatchObject({ customer: 'cus_1', 'expand[0]': 'data.latest_charge' })
		expect(
			requests.find(({ path }) => path === '/v1/disputes')?.params,
		).toMatchObject({ payment_intent: 'pi_2' })
	})

	it('reads, when asked, the periods paid invoices bill and their refunds', async () => {
		const line = (fields: object) => ({
			id: 'il_1',
			object: 'line_item',
			amount: 9_90,
			quantity: 2,
			period: { start: now, end: now + 30 * day },
			parent: { subscription_item_details: { proration: false } },
			pricing: { price_details: { price: price('pro', 'monthly') } },
			...fields,
		})
		const { gateway, requests } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/customers/cus_1':
					return { id: 'cus_1', object: 'customer' }
				case '/v1/subscriptions':
					return stripeList([])
				case '/v1/payment_intents':
					// Invoices' payments, which the plugin did not open.
					return stripeList([
						intent('pi_5', {
							metadata: {},
							latest_charge: {
								id: 'ch_5',
								amount_refunded: 9_90,
								disputed: true,
							},
						}),
						// The open attempt in_1 lists: what it refunded is not in_1's.
						intent('pi_6', {
							metadata: {},
							latest_charge: { id: 'ch_6', amount_refunded: 1_00 },
						}),
					])
				case '/v1/disputes':
					return stripeList([{ id: 'dp_5', object: 'dispute', status: 'lost' }])
				case '/v1/invoices':
					return stripeList([
						{
							id: 'in_1',
							object: 'invoice',
							customer: 'cus_1',
							amount_paid: 9_90,
							lines: stripeList([
								line({}),
								// A proration, and a trial's line at zero, bill no period.
								line({
									parent: { subscription_item_details: { proration: true } },
								}),
								line({ amount: 0 }),
							]),
							payments: stripeList([
								{ status: 'paid', payment: { payment_intent: 'pi_5' } },
								{ status: 'open', payment: { payment_intent: 'pi_6' } },
							]),
						},
						{
							id: 'in_2',
							object: 'invoice',
							customer: 'cus_1',
							amount_paid: 9_90,
							lines: stripeList([], true),
						},
					])
				case '/v1/invoices/in_2/lines':
					return stripeList([
						line({
							quantity: null,
							pricing: { price_details: { price: 'price_pro_yearly' } },
						}),
						line({ pricing: null }),
					])
				case '/v1/prices/price_pro_yearly':
					return price('pro', 'yearly')
				default:
					throw new Error(path)
			}
		})
		const end = new Date((now + 30 * day) * 1000)
		const state = await gateway.readCustomer('cus_1', { invoices: true })
		expect(state.invoices).toStrictEqual([
			{
				id: 'in_1',
				customerId: 'cus_1',
				periods: [{ product: 'pro', price: 'monthly', quantity: 2, end }],
				amount: 9_90,
				refunded: 9_90,
				disputeLost: true,
			},
			{
				id: 'in_2',
				customerId: 'cus_1',
				periods: [{ product: 'pro', price: 'yearly', quantity: 1, end }],
				amount: 9_90,
				refunded: 0,
				disputeLost: false,
			},
		])
		expect(state.payments).toStrictEqual([])
		expect(
			requests.find(({ path }) => path === '/v1/invoices')?.params,
		).toMatchObject({
			customer: 'cus_1',
			status: 'paid',
			'expand[0]': 'data.payments',
		})
	})

	it('reads a Checkout a full discount made free as a purchase, if asked', async () => {
		const session = (id: string, fields: object) => ({
			id,
			object: 'checkout.session',
			customer: 'cus_1',
			mode: 'payment',
			payment_intent: null,
			created: now,
			metadata: { managedBy: 'ultimabase', product: 'gemPack', quantity: '2' },
			...fields,
		})
		const { gateway, requests } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/customers/cus_1':
					return { id: 'cus_1', object: 'customer' }
				case '/v1/checkout/sessions':
					return stripeList([
						session('cs_1', {}),
						// Paid, a subscription, or not the plugin's: not a free purchase.
						session('cs_2', { payment_intent: 'pi_2' }),
						session('cs_3', { mode: 'subscription' }),
						session('cs_4', { metadata: {} }),
					])
				default:
					return stripeList([])
			}
		})
		expect(
			(await gateway.readCustomer('cus_1', { free: true })).payments,
		).toStrictEqual([
			{
				id: 'cs_1',
				customerId: 'cus_1',
				product: 'gemPack',
				quantity: 2,
				amount: 0,
				refunded: 0,
				disputeLost: false,
				paidAt: new Date(now * 1000),
				receiptUrl: null,
			},
		])
		expect(
			requests.find(({ path }) => path === '/v1/checkout/sessions')?.params,
		).toMatchObject({ customer: 'cus_1', status: 'complete' })
		// Not asked, the Checkouts are not read.
		const before = requests.length
		await gateway.readCustomer('cus_1')
		expect(requests.slice(before).map(({ path }) => path)).not.toContain(
			'/v1/checkout/sessions',
		)
	})

	it('reads a customer deleted or unknown at Stripe as deleted', async () => {
		const gone = {
			deleted: true,
			subscriptions: [],
			payments: [],
			invoices: [],
		}
		const deleted = gatewayOn(() => ({
			id: 'cus_1',
			object: 'customer',
			deleted: true,
		}))
		expect(await deleted.gateway.readCustomer('cus_1')).toStrictEqual(gone)
		const unknown = gatewayOn(missing)
		expect(await unknown.gateway.readCustomer('cus_1')).toStrictEqual(gone)
	})

	it('is unavailable while Stripe cannot answer', async () => {
		const { gateway } = gatewayOn(down)
		await expect(gateway.readCustomer('cus_1')).rejects.toMatchObject({
			code: 'PAYMENT_UNAVAILABLE',
		})
	})
})

describe('a customer', () => {
	it('is created once by its idempotency key, with the payer’s profile', async () => {
		const { gateway, requests } = gatewayOn(() => ({
			id: 'cus_1',
			object: 'customer',
		}))
		const profile = { email: 'ada@example.com', name: 'Ada', locale: 'fr' }
		expect(await gateway.createCustomer(profile, 'customer-1')).toBe('cus_1')
		await gateway.updateCustomer('cus_1', {
			email: null,
			name: null,
			locale: null,
		})
		expect(requests).toStrictEqual([
			{
				method: 'POST',
				path: '/v1/customers',
				params: {
					email: 'ada@example.com',
					name: 'Ada',
					'preferred_locales[0]': 'fr',
					'metadata[managedBy]': 'ultimabase',
				},
				idempotencyKey: 'customer-1',
			},
			expect.objectContaining({ path: '/v1/customers/cus_1', params: {} }),
		])
	})

	it('is deleted, or found deleted already', async () => {
		const { gateway, requests } = gatewayOn(() => ({
			id: 'cus_1',
			deleted: true,
		}))
		await gateway.deleteCustomer('cus_1')
		expect(requests).toMatchObject([
			{ method: 'DELETE', path: '/v1/customers/cus_1' },
		])
		await gatewayOn(missing).gateway.deleteCustomer('cus_1')
		await expect(
			gatewayOn(down).gateway.deleteCustomer('cus_1'),
		).rejects.toMatchObject({
			code: 'PAYMENT_UNAVAILABLE',
		})
	})

	it('is not updated when Stripe deleted it', async () => {
		const { gateway } = gatewayOn(missing)
		const profile = { email: null, name: null, locale: null }
		await expect(
			gateway.updateCustomer('cus_1', profile),
		).rejects.toBeInstanceOf(Missing)
	})
})

describe('customerOf', () => {
	const objects: Readonly<Record<string, object>> = {
		'/v1/checkout/sessions/cs_1': { customer: 'cus_1' },
		'/v1/subscriptions/sub_1': { customer: 'cus_1' },
		'/v1/subscription_schedules/sub_sched_1': { customer: { id: 'cus_1' } },
		'/v1/invoices/in_1': { customer: 'cus_1' },
		'/v1/payment_intents/pi_1': { customer: 'cus_1' },
		'/v1/charges/ch_1': { customer: 'cus_1' },
		'/v1/disputes/dp_1': { charge: 'ch_1' },
		'/v1/disputes/dp_2': { charge: null },
		'/v1/radar/early_fraud_warnings/issfr_1': { charge: { id: 'ch_1' } },
	}
	const { gateway } = gatewayOn(({ path }) => objects[path] ?? missing())

	const read = async (type: string, id: string) => gateway.customerOf(type, id)

	it('reads the customer an event’s object belongs to', async () => {
		expect(await read('customer', 'cus_1')).toBe('cus_1')
		expect(await read('checkout.session', 'cs_1')).toBe('cus_1')
		expect(await read('subscription', 'sub_1')).toBe('cus_1')
		expect(await read('subscription_schedule', 'sub_sched_1')).toBe('cus_1')
		expect(await read('invoice', 'in_1')).toBe('cus_1')
		expect(await read('payment_intent', 'pi_1')).toBe('cus_1')
		expect(await read('charge', 'ch_1')).toBe('cus_1')
		expect(await read('dispute', 'dp_1')).toBe('cus_1')
		expect(await read('radar.early_fraud_warning', 'issfr_1')).toBe('cus_1')
	})

	it('finds none for an object of no customer, or one Stripe lacks', async () => {
		expect(await gateway.customerOf('dispute', 'dp_2')).toBeNull()
		expect(await gateway.customerOf('product', 'prod_1')).toBeNull()
		expect(await gateway.customerOf('invoice', 'in_2')).toBeNull()
		await expect(
			gatewayOn(down).gateway.customerOf('invoice', 'in_1'),
		).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
	})
})

/** Stripe's answers about Checkouts. */
const checkoutAnswer = ({ method, path }: StripeRequest) => {
	if (path === '/v1/prices')
		return stripeList([{ id: 'price_1', object: 'price' }])
	if (path === '/v1/checkout/sessions' && method === 'GET') {
		return stripeList([{ id: 'cs_1' }, { id: 'cs_2' }])
	}
	if (path === '/v1/checkout/sessions/cs_1')
		return { id: 'cs_1', customer: 'cus_1' }
	return { id: 'cs_9', url: 'https://checkout.stripe.com/c/cs_9' }
}

describe('a Checkout', () => {
	const write = {
		customerId: 'cus_1',
		reference: 'user_1',
		product: 'pro',
		lookupKey: 'pro.monthly',
		quantity: 2,
		successUrl: 'https://app.test/paid',
		cancelUrl: 'https://app.test/shop',
		metadata: { campaign: 'spring' },
	}

	it('opens a subscription with its trial, terms and promotion codes', async () => {
		const { gateway, requests } = gatewayOn(checkoutAnswer)
		expect(
			await gateway.openCheckout({
				...write,
				mode: 'subscription',
				trialDays: 14,
				terms: { acceptance: 'I accept the [terms](https://app.test/terms).' },
				promotionCodes: true,
				// Checkout knows French, not Belgian French.
				locale: 'fr-be',
			}),
		).toBe('https://checkout.stripe.com/c/cs_9')
		expect(requests.map(({ params }) => params)).toStrictEqual([
			{ 'lookup_keys[0]': 'pro.monthly', active: 'true', limit: '1' },
			{
				mode: 'subscription',
				customer: 'cus_1',
				client_reference_id: 'user_1',
				'line_items[0][price]': 'price_1',
				'line_items[0][quantity]': '2',
				success_url: 'https://app.test/paid',
				cancel_url: 'https://app.test/shop',
				'metadata[campaign]': 'spring',
				'metadata[managedBy]': 'ultimabase',
				'metadata[product]': 'pro',
				locale: 'fr',
				'consent_collection[terms_of_service]': 'required',
				'custom_text[terms_of_service_acceptance][message]':
					'I accept the [terms](https://app.test/terms).',
				allow_promotion_codes: 'true',
				'subscription_data[metadata][campaign]': 'spring',
				'subscription_data[metadata][managedBy]': 'ultimabase',
				'subscription_data[metadata][product]': 'pro',
				'subscription_data[trial_period_days]': '14',
			},
		])
	})

	it('opens a payment whose intent names its product', async () => {
		const { gateway, requests } = gatewayOn(checkoutAnswer)
		await gateway.openCheckout({
			...write,
			mode: 'payment',
			trialDays: null,
			terms: null,
			promotionCodes: false,
			locale: null,
		})
		// No terms, promotion codes, trial or locale: none is sent.
		expect(requests[1]?.params).toStrictEqual({
			mode: 'payment',
			customer: 'cus_1',
			client_reference_id: 'user_1',
			'line_items[0][price]': 'price_1',
			'line_items[0][quantity]': '2',
			success_url: 'https://app.test/paid',
			cancel_url: 'https://app.test/shop',
			'metadata[campaign]': 'spring',
			'metadata[managedBy]': 'ultimabase',
			'metadata[product]': 'pro',
			// The Checkout keeps it too: a free one has no payment.
			'metadata[quantity]': '2',
			'payment_intent_data[metadata][campaign]': 'spring',
			'payment_intent_data[metadata][managedBy]': 'ultimabase',
			'payment_intent_data[metadata][product]': 'pro',
			'payment_intent_data[metadata][quantity]': '2',
		})
	})

	it('refuses a price the catalog did not write', async () => {
		const { gateway } = gatewayOn(() => stripeList([]))
		const checkout = { ...write, mode: 'payment' as const, trialDays: null }
		await expect(
			gateway.openCheckout({
				...checkout,
				terms: null,
				promotionCodes: false,
				locale: null,
			}),
		).rejects.toThrow(
			'Stripe holds no active price pro.monthly: apply the catalog.',
		)
	})

	it('expires the open ones, and reads the customer of one', async () => {
		const { gateway, requests } = gatewayOn(checkoutAnswer)
		await gateway.expireCheckouts('cus_1')
		expect(
			requests.map(({ method, path }) => `${method} ${path}`),
		).toStrictEqual([
			'GET /v1/checkout/sessions',
			'POST /v1/checkout/sessions/cs_1/expire',
			'POST /v1/checkout/sessions/cs_2/expire',
		])
		expect(requests[0]?.params).toMatchObject({
			customer: 'cus_1',
			status: 'open',
		})
		expect(await gateway.checkoutCustomer('cs_1')).toBe('cus_1')
		expect(await gatewayOn(missing).gateway.checkoutCustomer('cs_1')).toBeNull()
		await expect(
			gatewayOn(down).gateway.checkoutCustomer('cs_1'),
		).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
	})
})

/** Stripe's answers about the portal. */
const portalAnswer = ({ path }: StripeRequest) => {
	if (path === '/v1/subscriptions/sub_1') return subscription({})
	if (path === '/v1/subscriptions/sub_2') {
		return subscription({ items: { object: 'list', data: [] } })
	}
	if (path === '/v1/prices')
		return stripeList([{ id: 'price_team', object: 'price' }])
	return { id: 'bps_1', url: 'https://billing.stripe.com/p/bps_1' }
}

describe('the portal', () => {
	const portal = {
		customerId: 'cus_1',
		configuration: 'bpc_1',
		returnUrl: 'https://app.test/account',
		locale: null,
	}

	it('opens its home, a cancellation, a change keeping the quantity, and the payment method', async () => {
		const { gateway, requests } = gatewayOn(portalAnswer)
		expect(
			await gateway.openPortal({ ...portal, flow: { kind: 'home' } }),
		).toBe('https://billing.stripe.com/p/bps_1')
		await gateway.openPortal({
			...portal,
			// The portal knows Australian English, Checkout does not.
			locale: 'en-AU',
			configuration: null,
			flow: { kind: 'cancel', subscriptionId: 'sub_1' },
		})
		await gateway.openPortal({
			...portal,
			flow: {
				kind: 'change',
				subscriptionId: 'sub_1',
				lookupKey: 'team.monthly',
			},
		})
		await gateway.openPortal({ ...portal, flow: { kind: 'paymentMethod' } })
		const sessions = requests.filter(
			({ path }) => path === '/v1/billing_portal/sessions',
		)
		expect(sessions.map(({ params }) => params)).toStrictEqual([
			{
				customer: 'cus_1',
				return_url: 'https://app.test/account',
				configuration: 'bpc_1',
			},
			{
				customer: 'cus_1',
				return_url: 'https://app.test/account',
				locale: 'en-AU',
				'flow_data[type]': 'subscription_cancel',
				'flow_data[subscription_cancel][subscription]': 'sub_1',
				'flow_data[after_completion][type]': 'redirect',
				'flow_data[after_completion][redirect][return_url]':
					'https://app.test/account',
			},
			{
				customer: 'cus_1',
				return_url: 'https://app.test/account',
				configuration: 'bpc_1',
				'flow_data[type]': 'subscription_update_confirm',
				'flow_data[subscription_update_confirm][subscription]': 'sub_1',
				'flow_data[subscription_update_confirm][items][0][id]': 'si_1',
				'flow_data[subscription_update_confirm][items][0][price]': 'price_team',
				'flow_data[subscription_update_confirm][items][0][quantity]': '3',
				'flow_data[after_completion][type]': 'redirect',
				'flow_data[after_completion][redirect][return_url]':
					'https://app.test/account',
			},
			{
				customer: 'cus_1',
				return_url: 'https://app.test/account',
				configuration: 'bpc_1',
				'flow_data[type]': 'payment_method_update',
				'flow_data[after_completion][type]': 'redirect',
				'flow_data[after_completion][redirect][return_url]':
					'https://app.test/account',
			},
		])
	})

	it('refuses a change of a subscription with no item', async () => {
		const { gateway } = gatewayOn(portalAnswer)
		await expect(
			gateway.openPortal({
				...portal,
				flow: {
					kind: 'change',
					subscriptionId: 'sub_2',
					lookupKey: 'team.monthly',
				},
			}),
		).rejects.toThrow('The subscription has no item.')
	})
})

describe('moveCard', () => {
	it("makes the card its customer's, then clears the subscription's", async () => {
		const { gateway, requests } = gatewayOn(() => ({ id: 'x' }))
		await gateway.moveCard({ id: 'sub_1', customerId: 'cus_1', card: 'pm_1' })
		expect(
			requests.map(({ path, params }) => ({ path, params })),
		).toStrictEqual([
			{
				path: '/v1/customers/cus_1',
				params: { 'invoice_settings[default_payment_method]': 'pm_1' },
			},
			{
				path: '/v1/subscriptions/sub_1',
				params: { default_payment_method: '' },
			},
		])
		await expect(
			gatewayOn(down).gateway.moveCard({
				id: 'sub_1',
				customerId: 'cus_1',
				card: 'pm_1',
			}),
		).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
	})
})

describe('a page’s locale', () => {
	it('is the payer’s, else its language, else the page’s choice', () => {
		const cases = [
			['fr', checkoutLocales, 'fr'],
			['pt-br', checkoutLocales, 'pt-BR'],
			['fr-BE', checkoutLocales, 'fr'],
			['en-AU', checkoutLocales, 'en'],
			['en-AU', portalLocales, 'en-AU'],
			['hi-IN', checkoutLocales, 'hi-IN'],
			['hi-IN', portalLocales, 'auto'],
			['eo', checkoutLocales, 'auto'],
			['not a locale', checkoutLocales, 'auto'],
			[null, portalLocales, 'auto'],
		] as const
		const pages = cases.map(([locale, known]) => pageLocale(locale, known))
		expect(pages).toEqual(cases.map(([, , page]) => page))
	})
})

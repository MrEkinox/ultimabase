// The plugin against a Stripe sandbox (D-371 point 8), with `yarn
// test:stripe` and STRIPE_SECRET_KEY: what the fake cannot prove, that
// Stripe takes what the plugin sends and sends what the plugin reads. Each
// run makes a catalog and test clocks of its own, and archives them at the
// end; it never starts while another run holds the sandbox (D-393). CI runs
// it each night and on every run of `main` (D-378), never on a pull request.
import { runJobs } from '@ultimabase/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { gatewayOf } from './accounts.ts'
import { applyStripeCatalog } from './apply.ts'
import { stripe } from './calls.ts'
import { StripeEvent } from './models.ts'
import {
	billingTest,
	Balance,
	CreditHistory,
	M,
	urls,
	User,
} from './test/billing-app.ts'
import {
	advanced,
	alone,
	archived,
	cliKeys,
	client,
	delivered,
	forwarded,
	gemPack,
	listed,
	Purchase,
	Subscription,
	payerAtStripe,
	portal,
	priceId,
	pro,
	products,
	run,
	sandboxApp,
} from './test/sandbox.ts'

/** Stripe's events reach the application within a minute. */
const poll = { timeout: 60_000, interval: 2_000 }
const hour = 60 * 60 * 1000
/** A scenario that moves a test clock, which takes Stripe minutes. */
const clocked = 300_000

/** What `find` gives, once it gives something, within a minute. */
async function found<T>(find: () => Promise<T | undefined>): Promise<T> {
	for (let tries = 0; tries < 30; tries += 1) {
		const held = await find()
		if (held !== undefined) return held
		await new Promise((resolve) => setTimeout(resolve, 2_000))
	}
	throw new Error('Stripe made nothing in a minute.')
}

beforeAll(async () => {
	await alone()
	await applyStripeCatalog({
		secret: process.env['STRIPE_SECRET_KEY'],
		currency: 'eur',
		products,
		portal,
	})
})
afterAll(async () => {
	await archived()
})

describe('a payer at Stripe', () => {
	const test = billingTest(sandboxApp())

	it('is asked why it cancels, by the portal Stripe holds (D-384)', async () => {
		const secret = process.env['STRIPE_SECRET_KEY'] ?? ''
		const { portal: held } = await gatewayOf(secret).readCatalog()
		expect(held?.settings.cancelReasons).toStrictEqual(portal.cancelReasons)
	})

	const subscriptions = async () => {
		await delivered(test.url)
		return Subscription.findMany({}, M)
	}

	it('subscribes, changes plan and cancels', async () => {
		const { payer, customer } = await payerAtStripe()
		const checkout = await stripe.checkout({
			payer,
			product: pro,
			price: 'monthly',
			...urls,
		})
		expect(checkout).toMatch(/^https:\/\/checkout\.stripe\.com\//u)
		// Stripe takes the payer's language. The sandbox account has Managed
		// Payments, which refuses the terms text (D-383 point 4).
		const [session] = (await client.checkout.sessions.list({ customer })).data
		expect(session).toMatchObject({ locale: 'fr' })
		// Paid through the API, as Checkout would.
		const created = await client.subscriptions.create({
			customer,
			items: [{ price: await priceId(`${pro.key}.monthly`) }],
		})
		await expect
			.poll(subscriptions, poll)
			.toMatchObject([{ product: pro.key, price: 'monthly', status: 'active' }])
		for (const flow of [
			{},
			{ change: { product: pro, price: 'yearly' as const } },
			{ cancel: {} },
		]) {
			const url = await stripe.portal({ payer, ...flow })
			expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//u)
		}
		const item = created.items.data[0]?.id ?? ''
		await client.subscriptions.update(created.id, {
			items: [{ id: item, price: await priceId(`${pro.key}.yearly`) }],
			proration_behavior: 'none',
		})
		await expect
			.poll(subscriptions, poll)
			.toMatchObject([{ price: 'yearly', status: 'active' }])
		await client.subscriptions.cancel(created.id)
		await expect
			.poll(subscriptions, poll)
			.toMatchObject([{ status: 'canceled' }])
	})

	it('buys credits, keeps them after a partial refund, and loses them with the rest', async () => {
		const { payer, customer, method } = await payerAtStripe()
		const intent = await client.paymentIntents.create({
			amount: 4_90,
			currency: 'eur',
			customer,
			payment_method: method,
			confirm: true,
			off_session: true,
			metadata: { managedBy: 'ultimabase', product: gemPack.key },
		})
		const credits = async () => {
			await delivered(test.url)
			const where = { owner: { is: { id: payer.id } } }
			const [balance] = await Balance.findMany({ where }, M)
			const [purchase] = await Purchase.findMany({}, M)
			return {
				balance: balance?.amount,
				status: purchase?.status,
				refunded: purchase?.refunded,
			}
		}
		await expect
			.poll(credits, poll)
			.toStrictEqual({ balance: 500, status: 'paid', refunded: 0 })
		await client.refunds.create({ payment_intent: intent.id, amount: 1_00 })
		await expect
			.poll(credits, poll)
			.toStrictEqual({ balance: 500, status: 'paid', refunded: 1_00 })
		await client.refunds.create({ payment_intent: intent.id })
		await expect
			.poll(credits, poll)
			.toStrictEqual({ balance: 0, status: 'refunded', refunded: 4_90 })
	})

	it('is free with a full discount, and gives its credits', async () => {
		const { payer, customer } = await payerAtStripe()
		const coupon = await client.coupons.create({
			percent_off: 100,
			duration: 'forever',
			name: run,
		})
		try {
			const created = await client.subscriptions.create({
				customer,
				items: [{ price: await priceId(`${pro.key}.monthly`) }],
				discounts: [{ coupon: coupon.id }],
			})
			const invoice = await client.invoices.retrieve(
				typeof created.latest_invoice === 'string'
					? created.latest_invoice
					: (created.latest_invoice?.id ?? ''),
			)
			expect(invoice).toMatchObject({ status: 'paid', amount_paid: 0 })
			const held = async () => {
				await delivered(test.url)
				const where = { owner: { is: { id: payer.id } } }
				const [subscription] = await Subscription.findMany({}, M)
				const [balance] = await Balance.findMany({ where }, M)
				return {
					status: subscription?.status,
					amount: subscription?.amount,
					gems: balance?.amount,
				}
			}
			// The amount is the price before the discount.
			await expect
				.poll(held, poll)
				.toStrictEqual({ status: 'active', amount: 9_90, gems: 100 })
		} finally {
			await client.coupons.del(coupon.id)
		}
	})

	it('is synced by the hourly job when its events never came', async () => {
		const { customer } = await payerAtStripe()
		await client.subscriptions.create({
			customer,
			items: [{ price: await priceId(`${pro.key}.monthly`) }],
		})
		await expect.poll(async () => listed(customer), poll).toBe(true)
		vi.useFakeTimers({ toFake: ['Date'] })
		try {
			vi.setSystemTime(Date.now() + hour)
			await runJobs()
		} finally {
			vi.useRealTimers()
		}
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{ product: pro.key, status: 'active' },
		])
	})

	it('is closed at Stripe when the payer is deleted', async () => {
		const { payer, customer } = await payerAtStripe()
		await User.delete({ where: { id: payer.id } }, M)
		// With no billing row to take along, the hourly job finds it gone.
		vi.useFakeTimers({ toFake: ['Date'] })
		try {
			vi.setSystemTime(Date.now() + hour)
			await runJobs()
		} finally {
			vi.useRealTimers()
		}
		const held = await client.customers.retrieve(customer)
		expect(held.deleted).toBe(true)
	})
})

describe('one subscription per payer', () => {
	const test = billingTest(sandboxApp({ oneSubscription: true }))

	it('cancels and refunds a second subscription', async () => {
		const { customer } = await payerAtStripe()
		const price = await priceId(`${pro.key}.monthly`)
		const ids: string[] = []
		for (const _ of [1, 2]) {
			ids.push(
				(await client.subscriptions.create({ customer, items: [{ price }] }))
					.id,
			)
		}
		const statuses = async () => {
			await delivered(test.url)
			const held = await Promise.all(
				ids.map(async (id) => client.subscriptions.retrieve(id)),
			)
			return held.map(({ status }) => status).toSorted()
		}
		await expect.poll(statuses, poll).toStrictEqual(['active', 'canceled'])
		const ended = await Promise.all(
			ids.map(async (id) => client.subscriptions.retrieve(id)),
		)
		const second = ended.find(({ status }) => status === 'canceled')
		const invoice = second?.latest_invoice
		const payments = await client.invoicePayments.list({
			invoice: typeof invoice === 'string' ? invoice : (invoice?.id ?? ''),
			status: 'paid',
		})
		const paid = payments.data[0]?.payment.payment_intent
		const refunds = await client.refunds.list({
			payment_intent: typeof paid === 'string' ? paid : (paid?.id ?? ''),
		})
		expect(refunds.data).toHaveLength(1)
	})
})

describe("Stripe's own events", () => {
	const test = billingTest(sandboxApp({ keys: cliKeys() }))

	it('reach the webhook signed by Stripe, and sync the payer', async () => {
		const stop = await forwarded(test.url)
		try {
			const { customer } = await payerAtStripe()
			const { id } = await client.subscriptions.create({
				customer,
				items: [{ price: await priceId(`${pro.key}.monthly`) }],
			})
			const held = async () => {
				await runJobs()
				const where = { objectId: id, type: 'customer.subscription.created' }
				const events = await StripeEvent.findMany({ where }, M)
				const subscriptions = await Subscription.findMany({}, M)
				return {
					events: events.map(({ objectType }) => objectType),
					statuses: subscriptions.map(({ status }) => status),
				}
			}
			await expect
				.poll(held, poll)
				.toStrictEqual({ events: ['subscription'], statuses: ['active'] })
		} finally {
			stop()
		}
	})
})

/** A monthly Pro, paid by the customer's card. */
const subscribed = async (
	customer: string,
	params: { readonly trial_period_days?: number } = {},
) =>
	client.subscriptions.create({
		customer,
		items: [{ price: await priceId(`${pro.key}.monthly`) }],
		...params,
	})
/** A gem pack, paid by `method`. */
const bought = async (customer: string, method: string) =>
	client.paymentIntents.create({
		amount: 4_90,
		currency: 'eur',
		customer,
		payment_method: method,
		confirm: true,
		off_session: true,
		metadata: { managedBy: 'ultimabase', product: gemPack.key },
	})

describe('a payer over time', () => {
	const test = billingTest(sandboxApp())
	/** What the application holds of `payer`, once Stripe's events came. */
	const held = async (payer: { readonly id: string }) => {
		await delivered(test.url)
		const where = { owner: { is: { id: payer.id } } }
		const [subscription] = await Subscription.findMany({}, M)
		const [purchase] = await Purchase.findMany({}, M)
		const [balance] = await Balance.findMany({ where }, M)
		return {
			status: subscription?.status ?? purchase?.status,
			gems: balance?.amount ?? 0,
		}
	}

	it(
		'gets its credits again with each renewal, once each',
		async () => {
			const { payer, customer, clock } = await payerAtStripe()
			await subscribed(customer)
			const active = { status: 'active', gems: 100 }
			await expect.poll(async () => held(payer), poll).toStrictEqual(active)
			await advanced(clock, 32)
			const renewed = { status: 'active', gems: 200 }
			await expect.poll(async () => held(payer), poll).toStrictEqual(renewed)
			// Every event once more, newest first, as lost answers bring them.
			await delivered(test.url, { again: customer })
			expect(await held(payer)).toStrictEqual(renewed)
			const where = { reason: 'subscription' }
			expect(await CreditHistory.findMany({ where }, M)).toHaveLength(2)
		},
		clocked,
	)

	it(
		'pays its renewal with the card it set in the portal (D-380)',
		async () => {
			const { payer, customer, method, clock } = await payerAtStripe()
			// As Checkout leaves it: the card on the subscription, none on the customer.
			await client.customers.update(customer, {
				invoice_settings: { default_payment_method: '' },
			})
			const { id } = await client.subscriptions.create({
				customer,
				items: [{ price: await priceId(`${pro.key}.monthly`) }],
				default_payment_method: method,
				metadata: { managedBy: 'ultimabase' },
			})
			await expect
				.poll(async () => held(payer), poll)
				.toStrictEqual({ status: 'active', gems: 100 })
			const cards = async () => {
				const [one, subscription] = await Promise.all([
					client.customers.retrieve(customer),
					client.subscriptions.retrieve(id),
				])
				return {
					customer: one.deleted
						? null
						: one.invoice_settings.default_payment_method,
					subscription: subscription.default_payment_method,
				}
			}
			await expect
				.poll(cards, poll)
				.toStrictEqual({ customer: method, subscription: null })
			// What the portal does: a new card, the customer's default.
			const fresh = await client.paymentMethods.attach('pm_card_mastercard', {
				customer,
			})
			await client.customers.update(customer, {
				invoice_settings: { default_payment_method: fresh.id },
			})
			await advanced(clock, 32)
			const charged = async () => {
				const { data } = await client.charges.list({ customer })
				return data.map(({ payment_method_details: paid }) => paid?.card?.last4)
			}
			// Newest first: the renewal on the new card, the first payment on the old.
			await expect.poll(charged, poll).toStrictEqual(['4444', '4242'])
		},
		clocked,
	)

	it(
		'is past due, with no new credits, when its renewal is declined',
		async () => {
			const { payer, customer, clock } = await payerAtStripe()
			await subscribed(customer)
			await expect
				.poll(async () => held(payer), poll)
				.toStrictEqual({ status: 'active', gems: 100 })
			const declined = await client.paymentMethods.attach(
				'pm_card_chargeCustomerFail',
				{ customer },
			)
			await client.customers.update(customer, {
				invoice_settings: { default_payment_method: declined.id },
			})
			await advanced(clock, 32)
			await expect
				.poll(async () => held(payer), poll)
				.toStrictEqual({ status: 'past_due', gems: 100 })
		},
		clocked,
	)

	it(
		'gets nothing in its trial, then its credits with the first payment',
		async () => {
			const { payer, customer, clock } = await payerAtStripe()
			await subscribed(customer, { trial_period_days: 7 })
			await expect
				.poll(async () => held(payer), poll)
				.toStrictEqual({ status: 'trialing', gems: 0 })
			await advanced(clock, 8)
			await expect
				.poll(async () => held(payer), poll)
				.toStrictEqual({ status: 'active', gems: 100 })
		},
		clocked,
	)

	it('loses its credits with a lost dispute', async () => {
		const { payer, customer } = await payerAtStripe()
		const disputed = await client.paymentMethods.attach(
			'pm_card_createDispute',
			{ customer },
		)
		const intent = await bought(customer, disputed.id)
		await expect
			.poll(async () => held(payer), poll)
			.toMatchObject({ status: 'paid', gems: 500 })
		const dispute = await found(async () => {
			const { data } = await client.disputes.list({ payment_intent: intent.id })
			return data[0]
		})
		await client.disputes.update(dispute.id, {
			evidence: { uncategorized_text: 'losing_evidence' },
			submit: true,
		})
		await expect
			.poll(async () => held(payer), poll)
			.toMatchObject({ status: 'refunded', gems: 0 })
	})
})

/** What the application holds of a payer at risk, once the jobs ran. */
const heldAtRisk = async (payer: { readonly id: string }) => {
	await runJobs()
	const where = { owner: { is: { id: payer.id } } }
	const [balance] = await Balance.findMany({ where }, M)
	const mine = { where: { payer: { is: { id: payer.id } } } }
	const subscriptions = await Subscription.findMany(mine, M)
	const purchases = await Purchase.findMany(mine, M)
	return {
		subscriptions: subscriptions.map(({ status }) => status),
		purchases: purchases.map(({ status }) => status),
		gems: balance?.amount ?? 0,
	}
}

describe('a payment at risk (D-388)', () => {
	const risk = {
		earlyFraudWarning: 'refundAndCancel',
		dispute: 'cancel',
	} as const
	// Stripe's own thin events: their object's type is what the plugin reads.
	const test = billingTest(sandboxApp({ keys: cliKeys(), risk }))
	it('refunds a payment Radar warns of, and ends its payer’s subscription', async () => {
		const stop = await forwarded(test.url)
		try {
			const { payer, customer } = await payerAtStripe()
			await subscribed(customer)
			const warned = await client.paymentMethods.attach(
				'pm_card_createIssuerFraudRecord',
				{ customer },
			)
			const intent = await bought(customer, warned.id)
			await expect
				.poll(async () => heldAtRisk(payer), poll)
				.toStrictEqual({
					subscriptions: ['canceled'],
					purchases: ['refunded'],
					gems: 100,
				})
			const { data } = await client.refunds.list({ payment_intent: intent.id })
			expect(data.map(({ amount }) => amount)).toStrictEqual([4_90])
		} finally {
			stop()
		}
	})

	it('ends a disputed payment’s subscription, and refunds nothing', async () => {
		const stop = await forwarded(test.url)
		try {
			const { payer, customer } = await payerAtStripe()
			await subscribed(customer)
			const disputed = await client.paymentMethods.attach(
				'pm_card_createDispute',
				{ customer },
			)
			const intent = await bought(customer, disputed.id)
			await expect
				.poll(async () => heldAtRisk(payer), poll)
				.toStrictEqual({
					subscriptions: ['canceled'],
					purchases: ['paid'],
					gems: 600,
				})
			const { data } = await client.refunds.list({ payment_intent: intent.id })
			expect(data).toStrictEqual([])
		} finally {
			stop()
		}
	})
})

// The plugin against a Stripe sandbox (D-371 point 8), with `yarn
// test:stripe` and STRIPE_SECRET_KEY: what the fake cannot prove, that
// Stripe takes what the plugin sends and sends what the plugin reads. Each
// run makes a catalog and test clocks of its own, and archives them at the
// end. CI runs none of it.
import { runJobs } from '@ultimabase/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyStripeCatalog } from './apply.ts'
import { stripe } from './calls.ts'
import { StripeEvent } from './models.ts'
import {
	billingTest,
	Balance,
	CreditHistory,
	M,
	Purchase,
	Subscription,
	urls,
	User,
} from './test/billing-app.ts'
import {
	advanced,
	archived,
	cliKeys,
	client,
	delivered,
	forwarded,
	gemPack,
	listed,
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

	it('buys credits, and gives them back with a refund', async () => {
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
			return { balance: balance?.amount, status: purchase?.status }
		}
		await expect
			.poll(credits, poll)
			.toStrictEqual({ balance: 500, status: 'paid' })
		await client.refunds.create({ payment_intent: intent.id })
		await expect
			.poll(credits, poll)
			.toStrictEqual({ balance: 0, status: 'refunded' })
	})

	it('is free with a promotion code, and gives its credits', async () => {
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
			...(purchase !== undefined && { refunded: purchase.refunded }),
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
		'is past due, with no credits, when its renewal is declined',
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

	it('keeps its credits after a partial refund', async () => {
		const { payer, customer, method } = await payerAtStripe()
		const intent = await bought(customer, method)
		await expect
			.poll(async () => held(payer), poll)
			.toStrictEqual({ status: 'paid', gems: 500, refunded: 0 })
		await client.refunds.create({ payment_intent: intent.id, amount: 1_00 })
		await expect
			.poll(async () => held(payer), poll)
			.toStrictEqual({ status: 'paid', gems: 500, refunded: 1_00 })
	})

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

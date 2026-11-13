// The webhook (D-371 point 4) and the jobs behind it: an event is verified
// on its raw body, stored once and answered at once; its job, the hourly
// reconciliation and a payer's delete keep the rows in step with Stripe.
import { asUser, runJobs, testApplication } from '@ultimabase/testing'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { stripe } from './index.ts'
import { M as master, StripeCustomer, StripeEvent } from './models.ts'
import {
	Balance,
	billingApp,
	M,
	Subscription,
	team,
	urls,
	User,
} from './test/billing-app.ts'
import { postEvent, thinEvent } from './testing.ts'

beforeAll(() => {
	vi.stubEnv('NODE_ENV', 'development')
})
afterEach(() => {
	vi.useRealTimers()
})

const { app, fake, lines } = billingApp()
const test = testApplication(app)

const signUp = () => User.create({ data: { email: 'ada@example.com' } }, M)
const delivered = async () => {
	await fake.deliver(test.url)
	await runJobs()
}
/** A subscribed payer, and its customer's id at Stripe. */
async function subscribed() {
	const ada = await signUp()
	const url = await stripe.checkout({ payer: ada, product: team, ...urls })
	const subscription = fake.pay(url)
	await delivered()
	const customer = fake.subscriptions.get(subscription)?.customerId ?? ''
	return { ada, subscription, customer }
}
const post = (payload: string, secret = fake.webhookSecret) =>
	postEvent(test.url, payload, { secret })
const event = (id: string, livemode = false) =>
	thinEvent({
		id,
		type: 'customer.subscription.updated',
		object: { id: 'sub_unknown', type: 'subscription' },
		livemode,
	})

describe('the webhook', () => {
	it('stores an event once, however often Stripe sends it', async () => {
		const payload = event('evt_twice')
		for (const _ of [1, 2]) {
			const response = await post(payload)
			expect(response.status).toBe(200)
			expect(await response.json()).toStrictEqual({ received: true })
		}
		expect(await StripeEvent.findMany({}, master)).toMatchObject([
			{
				stripeId: 'evt_twice',
				type: 'customer.subscription.updated',
				objectType: 'subscription',
				objectId: 'sub_unknown',
			},
		])
		await runJobs()
		const [stored] = await StripeEvent.findMany({}, master)
		expect(stored?.processedAt).toBeInstanceOf(Date)
	})

	it('refuses an event signed with another secret, or not signed', async () => {
		const forged = await post(event('evt_forged'), 'whsec_other')
		expect(forged.status).toBe(401)
		expect(await forged.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
		const unsigned = await fetch(`${test.url}/webhooks/stripe`, {
			method: 'POST',
			body: event('evt_unsigned'),
		})
		expect(unsigned.status).toBe(401)
		expect(await StripeEvent.count({}, master)).toBe(0)
	})

	it('drops an event of the other mode', async () => {
		const response = await post(event('evt_live', true))
		expect(await response.json()).toStrictEqual({ received: false })
		expect(await StripeEvent.count({}, master)).toBe(0)
		expect(lines).toContainEqual({
			level: 'warn',
			message: 'A Stripe event of the other mode was dropped.',
			details: { event: 'evt_live', livemode: true },
		})
	})

	it('fails a test whose application refuses the fake’s events', async () => {
		const { subscription } = await subscribed()
		fake.update(subscription, {})
		await expect(fake.deliver(test.url, '/elsewhere')).rejects.toThrow(
			'The webhook answered 404.',
		)
	})

	it('marks an event about no object processed', async () => {
		const payload = thinEvent({
			type: 'account.updated',
			object: { id: '', type: 'account' },
		})
		await post(payload)
		await runJobs()
		const [stored] = await StripeEvent.findMany({}, master)
		expect(stored?.processedAt).toBeInstanceOf(Date)
	})
})

describe('a payer’s delete', () => {
	it('closes its customer at Stripe, which ends its subscriptions', async () => {
		const { ada, subscription, customer } = await subscribed()
		await User.delete({ where: { id: ada.id } }, M)
		await runJobs()
		expect(fake.customers.get(customer)?.deleted).toBe(true)
		expect(fake.subscriptions.get(subscription)?.status).toBe('canceled')
		expect(await StripeCustomer.count({}, master)).toBe(0)
		await delivered()
	})

	it('removes the billing rows when the payer deletes itself', async () => {
		const { ada, subscription, customer } = await subscribed()
		await User.delete({ where: { id: ada.id } }, { as: asUser(ada) })
		expect(await Subscription.count({}, M)).toBe(0)
		await runJobs()
		expect(fake.customers.get(customer)?.deleted).toBe(true)
		expect(fake.subscriptions.get(subscription)?.status).toBe('canceled')
	})

	it('leaves the customer of a payer still there', async () => {
		const { ada, customer } = await subscribed()
		const where = { payer: { is: { id: ada.id } } }
		await Subscription.deleteMany({ where }, M)
		await runJobs()
		expect(fake.customers.get(customer)?.deleted).toBe(false)
		expect(await StripeCustomer.count({}, master)).toBe(1)
	})
})

describe('the hourly reconciliation', () => {
	const hour = 60 * 60 * 1000

	it('closes the customer of a payer deleted with no billing row', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		const customer = fake.checkouts.get(url.split('/').at(-1) ?? '')?.customerId
		await User.delete({ where: { id: ada.id } }, M)
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.now() + hour)
		await runJobs()
		expect(fake.customers.get(customer ?? '')?.deleted).toBe(true)
		expect(await StripeCustomer.count({}, master)).toBe(0)
	})

	it('writes what a lost webhook missed, once the period ends', async () => {
		const { subscription } = await subscribed()
		const held = fake.subscriptions.get(subscription)
		if (held === undefined) throw new Error('No subscription.')
		// Changed at Stripe, its event lost.
		fake.subscriptions.set(subscription, { ...held, status: 'past_due' })
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(held.currentPeriodEnd.getTime() + hour)
		await runJobs()
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{ status: 'past_due' },
		])
	})

	it('syncs a customer whose events were lost, once', async () => {
		const { subscription } = await subscribed()
		// Changed at Stripe, its event lost.
		fake.update(subscription, { status: 'past_due' })
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.now() + hour)
		await runJobs()
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{ status: 'past_due' },
		])
		const [synced] = await StripeCustomer.findMany({}, master)
		vi.setSystemTime(Date.now() + hour)
		await runJobs()
		const [after] = await StripeCustomer.findMany({}, master)
		expect(after?.syncsBegun).toBe(synced?.syncsBegun)
	})

	it('reads every customer, page after page', async () => {
		// A payer model no billing model names any more keeps its rows: a
		// first page of 500 of them.
		const data = Array.from({ length: 500 }, (_, index) => ({
			model: 'Removed',
			payer: `kept-${String(index)}`,
		}))
		await StripeCustomer.createMany({ data }, master)
		// Made after, so its id sorts on the second page.
		const gone = { model: 'User', payer: 'gone' }
		await StripeCustomer.create({ data: gone }, master)
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.now() + hour)
		await runJobs()
		const left = await StripeCustomer.findMany({}, master)
		expect(left).toHaveLength(500)
		expect(left.map(({ model }) => model)).not.toContain('User')
	})

	it('runs the events still waiting, and forgets the old processed ones', async () => {
		const { customer } = await subscribed()
		const waiting = await StripeEvent.create(
			{
				data: {
					stripeId: 'evt_waiting',
					type: 'customer.updated',
					objectType: 'customer',
					objectId: customer,
				},
			},
			master,
		)
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.now() + 91 * 24 * hour)
		await runJobs()
		const left = await StripeEvent.findMany({}, master)
		expect(left.map(({ id }) => id)).toStrictEqual([waiting.id])
		expect(left[0]?.processedAt).toBeInstanceOf(Date)
	})
})

describe('a billing model', () => {
	it('is written by the plugin only', async () => {
		const ada = await signUp()
		const as = asUser(ada)
		const data = {
			owner: { connect: { id: ada.id } },
			credit: 'gems',
			amount: 9,
		}
		await expect(Balance.create({ data }, { as })).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(lines).toContainEqual({
			level: 'warn',
			message: 'Balance create refused.',
			details: { model: 'Balance', operation: 'create', callerId: ada.id },
		})
	})

	it('is not deleted alone by a user', async () => {
		const { ada } = await subscribed()
		const as = asUser(ada)
		await expect(Subscription.deleteMany({}, { as })).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(await Subscription.count({}, M)).toBe(1)
		expect(lines).toContainEqual({
			level: 'warn',
			message: 'Subscription delete refused.',
			details: {
				model: 'Subscription',
				operation: 'delete',
				callerId: ada.id,
			},
		})
	})
})

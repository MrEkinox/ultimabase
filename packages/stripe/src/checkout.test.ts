// A payer subscribes through Checkout (D-371, D-373 points 7 and 8): the
// webhook's job writes the subscription, the payer comes back before it, or
// opens the portal to change or cancel.
import { runJobs, testApplication } from '@ultimabase/testing'
import { Refused } from 'ultimabase'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { stripe } from './index.ts'
import {
	billingApp,
	gemPack,
	M,
	pro,
	Subscription,
	team,
	urls,
	User,
} from './test/billing-app.ts'

beforeAll(() => {
	vi.stubEnv('NODE_ENV', 'development')
})

const { app, fake } = billingApp()
const test = testApplication(app)

const signUp = (email = 'ada@example.com') =>
	User.create({ data: { email } }, M)

/** Pays the Checkout at `url`, then delivers Stripe's events and runs their jobs. */
async function paid(url: string): Promise<string> {
	const id = fake.pay(url)
	await fake.deliver(test.url)
	await runJobs()
	return id
}

const sessionOf = (url: string) => url.split('/').at(-1) ?? ''
/** The customer at Stripe of the Checkout at `url`. */
const customerOf = (url: string) =>
	fake.customers.get(fake.checkouts.get(sessionOf(url))?.customerId ?? '')

describe('stripe.checkout', () => {
	it('opens a Checkout the webhook then writes as a subscription', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({
			payer: ada,
			product: pro,
			price: 'yearly',
			trialDays: 14,
			...urls,
		})
		expect(fake.checkouts.get(sessionOf(url))).toMatchObject({
			mode: 'subscription',
			lookupKey: 'pro.yearly',
			reference: ada.id,
			quantity: 1,
			trialDays: 14,
			successUrl: urls.successUrl,
		})
		const customer = customerOf(url)
		expect(customer?.profile).toStrictEqual({
			email: 'ada@example.com',
			name: null,
			locale: null,
		})
		const id = await paid(url)
		const where = { payer: { is: { id: ada.id } } }
		expect(await Subscription.findMany({ where }, M)).toMatchObject([
			{
				stripeId: id,
				product: 'pro',
				price: 'yearly',
				status: 'trialing',
				quantity: 1,
				cancelAt: null,
			},
		])
	})

	it('takes a product’s only price by default, and refuses a wrong one', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		expect(fake.checkouts.get(sessionOf(url))?.lookupKey).toBe('team.monthly')
		await expect(
			stripe.checkout({ payer: ada, product: pro, ...urls }),
		).rejects.toThrow("pro's price is one of monthly, yearly.")
		await expect(
			stripe.checkout({ payer: ada, product: team, quantity: 0, ...urls }),
		).rejects.toThrow('stripe.checkout: quantity is a positive integer.')
	})

	it('refuses a product the plugin was not given', async () => {
		const ada = await signUp()
		const other = { ...pro }
		await expect(
			stripe.checkout({ payer: ada, product: other, ...urls }),
		).rejects.toThrow("pro is not in stripePlugin's products.")
	})

	it('refuses a payer that is not a row', async () => {
		await expect(
			stripe.checkout({ payer: { id: 'gone' }, product: team, ...urls }),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('expires the Checkouts a payer left open, so two tabs cannot both pay', async () => {
		const ada = await signUp()
		const first = await stripe.checkout({ payer: ada, product: team, ...urls })
		const second = await stripe.checkout({ payer: ada, product: team, ...urls })
		expect(fake.checkouts.get(sessionOf(first))?.status).toBe('expired')
		expect(() => fake.pay(first)).toThrow(`${first} is not open.`)
		await paid(second)
		expect(await Subscription.count({}, M)).toBe(1)
		// One customer for the payer, whatever the number of Checkouts.
		expect(customerOf(first)).toBe(customerOf(second))
	})

	it('gives the payer a new customer when Stripe deleted it', async () => {
		const ada = await signUp()
		const paidUrl = await stripe.checkout({
			payer: ada,
			product: team,
			...urls,
		})
		await paid(paidUrl)
		const deleted = customerOf(paidUrl)?.id ?? ''
		fake.deleteCustomer(deleted)
		await fake.deliver(test.url)
		await runJobs()
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{ status: 'canceled' },
		])
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		expect(customerOf(url)).toMatchObject({ deleted: false })
		expect(customerOf(url)?.id).not.toBe(deleted)
	})

	it('gives a deleted customer’s payer a new one, even before its event', async () => {
		const ada = await signUp()
		const first = await stripe.checkout({ payer: ada, product: team, ...urls })
		const deleted = customerOf(first)?.id ?? ''
		fake.deleteCustomer(deleted)
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		expect(customerOf(url)).toMatchObject({ deleted: false })
		expect(customerOf(url)?.id).not.toBe(deleted)
		await fake.deliver(test.url)
		await runJobs()
	})

	it('gives one customer to a payer checking out twice at once', async () => {
		const ada = await signUp()
		const [first, second] = await Promise.all([
			stripe.checkout({ payer: ada, product: team, ...urls }),
			stripe.checkout({ payer: ada, product: gemPack, ...urls }),
		])
		expect(customerOf(first)?.id).toBe(customerOf(second ?? '')?.id)
	})

	it('gives a payer whose profile changed a new customer when Stripe deleted it', async () => {
		const ada = await signUp()
		const first = await stripe.checkout({ payer: ada, product: team, ...urls })
		const deleted = customerOf(first)?.id ?? ''
		fake.deleteCustomer(deleted)
		const where = { id: ada.id }
		await User.update({ where, data: { email: 'ada@lovelace.test' } }, M)
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		expect(customerOf(url)).toMatchObject({
			deleted: false,
			profile: { email: 'ada@lovelace.test' },
		})
		expect(customerOf(url)?.id).not.toBe(deleted)
		await fake.deliver(test.url)
		await runJobs()
	})

	it('updates the customer’s profile when the payer’s changed', async () => {
		const ada = await signUp()
		const first = await stripe.checkout({ payer: ada, product: team, ...urls })
		const where = { id: ada.id }
		await User.update({ where, data: { email: 'ada@lovelace.test' } }, M)
		const url = await stripe.checkout({ payer: ada, product: gemPack, ...urls })
		expect(customerOf(url)?.id).toBe(customerOf(first)?.id)
		expect(customerOf(url)?.profile.email).toBe('ada@lovelace.test')
	})
})

describe('stripe.syncCheckout', () => {
	it('writes what the payer paid when it comes back, before the webhook', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		fake.pay(url)
		await stripe.syncCheckout(sessionOf(url), ada)
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{ product: 'team', price: 'monthly', status: 'active' },
		])
		const written = await Subscription.findMany({}, M)
		// The webhook's event, a minute later, finds it written already and
		// writes nothing: the model's hooks run on a change only.
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 })
		await fake.deliver(test.url)
		await runJobs()
		vi.useRealTimers()
		expect(await Subscription.findMany({}, M)).toStrictEqual(written)
	})

	it('finds no Checkout of another payer, nor an unknown one', async () => {
		const ada = await signUp()
		const bob = await signUp('bob@example.com')
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		await expect(
			stripe.syncCheckout(sessionOf(url), bob),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		await expect(stripe.syncCheckout('cs_unknown', ada)).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})
})

describe('stripe.portal', () => {
	it('opens the portal, and its change and cancel confirmations', async () => {
		const ada = await signUp()
		const id = await paid(
			await stripe.checkout({
				payer: ada,
				product: pro,
				price: 'monthly',
				...urls,
			}),
		)
		const url = await stripe.portal({ payer: ada })
		expect(url).toMatch(/^https:\/\/billing\.stripe\.test\//)
		await stripe.portal({
			payer: ada,
			change: { product: team, price: 'monthly' },
			returnUrl: 'https://app.test/plans',
		})
		await stripe.portal({ payer: ada, cancel: {} })
		const [portal] = fake.portals.keys()
		expect(fake.portalSessions).toMatchObject([
			{
				configuration: portal,
				returnUrl: 'https://app.test/account',
				flow: { kind: 'home' },
			},
			{
				returnUrl: 'https://app.test/plans',
				flow: { kind: 'change', subscriptionId: id, lookupKey: 'team.monthly' },
			},
			{ flow: { kind: 'cancel', subscriptionId: id } },
		])
	})

	it('refuses a deep link without a live subscription, or with two links', async () => {
		const ada = await signUp()
		await expect(
			stripe.portal({ payer: ada, cancel: {} }),
		).rejects.toMatchObject({ code: 'NOT_SUBSCRIBED' })
		await expect(
			stripe.portal({
				payer: ada,
				cancel: {},
				change: { product: team, price: 'monthly' },
			}),
		).rejects.toThrow('stripe.portal takes change or cancel, not both.')
	})

	it('asks which subscription when the payer has several', async () => {
		const ada = await signUp()
		await paid(await stripe.checkout({ payer: ada, product: team, ...urls }))
		const second = await paid(
			await stripe.checkout({
				payer: ada,
				product: pro,
				price: 'monthly',
				...urls,
			}),
		)
		const unnamed = stripe.portal({ payer: ada, cancel: {} })
		await expect(unnamed).rejects.toBeInstanceOf(Refused)
		await expect(unnamed).rejects.toThrow(
			'stripe.portal: the payer has several live subscriptions; name the one with cancel.subscription, a Subscription row’s id.',
		)
		const row = await Subscription.findUniqueOrThrow(
			{ where: { stripeId: second } },
			M,
		)
		await stripe.portal({ payer: ada, cancel: { subscription: row.id } })
		expect(fake.portalSessions.at(-1)?.flow).toStrictEqual({
			kind: 'cancel',
			subscriptionId: second,
		})
	})

	it('follows what the payer changed on the portal', async () => {
		const ada = await signUp()
		const id = await paid(
			await stripe.checkout({
				payer: ada,
				product: pro,
				price: 'monthly',
				...urls,
			}),
		)
		const at = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
		fake.update(id, {
			cancelAt: at,
			scheduled: { product: 'pro', price: 'yearly', at },
		})
		await fake.deliver(test.url)
		await runJobs()
		expect(await Subscription.findMany({}, M)).toMatchObject([
			{
				status: 'active',
				cancelAt: at,
				scheduledProduct: 'pro',
				scheduledPrice: 'yearly',
				scheduledAt: at,
			},
		])
	})
})

// `stripePlugin(options)` (D-371): what it checks at start (D-372 point 5,
// D-373), the catalog it compares with Stripe, an application without keys,
// and one subscription per payer.
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { runJobs } from '@ultimabase/testing'
import { defineApp, defineModel, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	defineBalance,
	defineCreditHistory,
	definePurchase,
	defineSubscription,
} from './billing.ts'
import type { StripeOptions } from './index.ts'
import { stripe, stripePlugin } from './index.ts'
import {
	billingTest,
	Balance,
	billingApp,
	gemPack,
	M,
	pro,
	Purchase,
	Subscription,
	team,
	urls,
	User,
} from './test/billing-app.ts'
import { fakeStripe, postEvent, thinEvent } from './testing.ts'

afterEach(() => {
	vi.unstubAllEnvs()
})

const signUp = () => User.create({ data: { email: 'ada@example.com' } }, M)

/** Starts, then stops, an application with these models and options. */
async function started(
	models: Parameters<typeof defineApp>[0]['models'],
	options: Partial<StripeOptions> = {},
): Promise<void> {
	const fake = fakeStripe()
	const app = defineApp({
		database: memory(),
		models,
		plugins: [
			httpPlugin(),
			jobsPlugin({ jobs: [] }),
			stripePlugin({
				keys: { secret: fake.secret, webhook: fake.webhookSecret },
				currency: 'eur',
				products: [],
				portal: { returnUrl: 'https://app.test/account' },
				...options,
			}),
		],
	})
	const runs = quietRuns(app)
	if (runs === undefined) throw new Error('No runs.')
	const running = runs.on(memory())
	try {
		await running.start()
	} finally {
		await running.stop()
	}
}

/** Starts an application whose stripePlugin gets these wrong options. */
const wrong = (options: object) => started([User], options)

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({ name: f.string() }),
})
const TeamBalance = defineBalance({ name: 'TeamBalance', owner: () => Team })
const TeamHistory = defineCreditHistory({
	name: 'TeamHistory',
	owner: () => Team,
})
const SecondSubscription = defineSubscription({
	name: 'SecondSubscription',
	payer: () => User,
})

describe('stripePlugin’s start', () => {
	it('refuses keys that are not a secret key and a signing secret', async () => {
		const keys = { secret: 'pk_test_x', webhook: 'whsec_x' }
		await expect(started([User], { keys })).rejects.toThrow(
			'stripePlugin: keys.secret is the secret key, sk_….',
		)
		await expect(
			started([User], { keys: { secret: 'sk_test_x', webhook: 'x' } }),
		).rejects.toThrow(
			'stripePlugin: keys.webhook is the signing secret, whsec_….',
		)
	})

	it('refuses options it does not take', async () => {
		await expect(wrong({ currency: 'EUR' })).rejects.toThrow(
			'stripePlugin: currency is a lowercase ISO code, as eur.',
		)
		await expect(wrong({ customer: 'email' })).rejects.toThrow(
			'stripePlugin: customer is (payer) => its profile.',
		)
		await expect(wrong({ oneSubscription: 'yes' })).rejects.toThrow(
			'stripePlugin: oneSubscription is true or false.',
		)
		await expect(wrong({ webhookPath: 'webhooks' })).rejects.toThrow(
			'stripePlugin: webhookPath is a path, as /webhooks/stripe.',
		)
		await expect(wrong({ trial: 7 })).rejects.toThrow('takes no trial')
	})

	it('refuses two models of one kind, and a payer not in the models', async () => {
		await expect(
			started([User, Subscription, SecondSubscription]),
		).rejects.toThrow(
			'models lists two models defineSubscription returned: an application has one.',
		)
		await expect(started([Subscription])).rejects.toThrow(
			'Subscription.payer: its target is not in models.',
		)
	})

	it('refuses credits owned by another model than the purchases’ payer', async () => {
		await expect(started([User, Team, Purchase, TeamBalance])).rejects.toThrow(
			"TeamBalance's owner and Purchase's payer are one model.",
		)
		await expect(started([User, Team, Balance, TeamHistory])).rejects.toThrow(
			"Balance's owner and TeamHistory's owner are one model.",
		)
		await expect(started([User, Balance])).rejects.toThrow(
			'Balance needs its history: declare it with defineCreditHistory.',
		)
	})

	it('refuses a product no model records', async () => {
		await expect(started([User], { products: [pro] })).rejects.toThrow(
			'pro is a subscription: declare its model with defineSubscription.',
		)
		await expect(
			started([User, Purchase], { products: [gemPack] }),
		).rejects.toThrow(
			'gemPack gives credits: declare their model with defineBalance.',
		)
		await expect(
			started([User, Subscription], { products: [pro] }),
		).rejects.toThrow(
			'pro gives credits: declare their model with defineBalance.',
		)
	})
})

describe('the billing models', () => {
	it('refuse a field the plugin adds, and a payer that is not a thunk', () => {
		expect(() =>
			defineSubscription({
				name: 'Taken',
				payer: () => User,
				fields: (f) => ({ status: f.string() }),
			}),
		).toThrow(
			'defineSubscription(Taken): status is a field defineSubscription adds.',
		)
		expect(() => {
			Reflect.apply(definePurchase, undefined, [{ name: 'Loose', payer: User }])
		}).toThrow('definePurchase(Loose): payer is () => its model.')
		expect(() => {
			Reflect.apply(defineBalance, undefined, [
				{ name: 'Open', owner: () => User, access: {} },
			])
		}).toThrow('Open: the definition takes no access')
	})
})

describe('the server calls', () => {
	it('run while the application runs', async () => {
		await expect(
			stripe.checkout({ payer: { id: 'x' }, product: team, ...urls }),
		).rejects.toThrow(
			'stripe.checkout runs while an application with stripePlugin() runs.',
		)
	})
})

describe('outside development', () => {
	const { app, fake, lines } = billingApp()
	billingTest(app)

	it('lists how the Stripe catalog differs, and changes nothing', () => {
		expect(fake.products.size).toBe(0)
		expect(lines).toContainEqual({
			level: 'warn',
			message:
				'The Stripe catalog differs from the code: apply it with applyStripeCatalog.',
			details: {
				changes: [
					'create the product pro: "Pro"',
					'create the product team: "Team"',
					'create the product gemPack: "500 gems"',
					'create the price pro.monthly: 9.90 EUR every month',
					'create the price pro.yearly: 99.00 EUR every year',
					'create the price team.monthly: 29.00 EUR every month',
					'create the price gemPack: 4.90 EUR once',
					'create the customer portal configuration',
				],
			},
		})
	})
})

describe('without keys', () => {
	const { app } = billingApp({ keys: undefined })
	const test = billingTest(app)

	it('starts, and every payment is unavailable', async () => {
		const ada = await signUp()
		await expect(
			stripe.checkout({ payer: ada, product: team, ...urls }),
		).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
		await expect(stripe.portal({ payer: ada })).rejects.toMatchObject({
			code: 'PAYMENT_UNAVAILABLE',
		})
		const payload = thinEvent({
			type: 'customer.updated',
			object: { id: 'cus_1', type: 'customer' },
		})
		const response = await postEvent(test.url, payload, { secret: 'whsec_x' })
		expect(response.status).toBe(503)
		expect(await response.json()).toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
		// The hourly reconciliation has nothing to do.
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(Date.now() + 60 * 60 * 1000)
		await runJobs()
		vi.useRealTimers()
	})
})

describe('one subscription per payer', () => {
	beforeEach(() => {
		vi.stubEnv('NODE_ENV', 'development')
	})
	const { app, fake, lines } = billingApp({
		oneSubscription: true,
		webhookPath: '/stripe/events',
	})
	const test = billingTest(app)

	it('refuses a second subscription, not a gem pack', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		fake.pay(url)
		await fake.deliver(test.url, '/stripe/events')
		await runJobs()
		expect(await Subscription.count({}, M)).toBe(1)
		await expect(
			stripe.checkout({ payer: ada, product: pro, price: 'monthly', ...urls }),
		).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' })
		await stripe.checkout({ payer: ada, product: gemPack, ...urls })
		expect(await Balance.count({}, M)).toBe(0)
	})

	it('ends a second subscription at once, and refunds it', async () => {
		const ada = await signUp()
		const url = await stripe.checkout({ payer: ada, product: team, ...urls })
		const first = fake.pay(url)
		await fake.deliver(test.url, '/stripe/events')
		await runJobs()
		// A second one, made at Stripe outside the plugin.
		const held = fake.subscriptions.get(first)
		if (held === undefined) throw new Error('No subscription.')
		// Begun the same second: the id decides which one stays.
		const second = 'sub_second'
		fake.subscriptions.set(second, { ...held, id: second })
		fake.update(second, {})
		await fake.deliver(test.url, '/stripe/events')
		await runJobs()
		expect(fake.subscriptions.get(first)?.status).toBe('active')
		expect(fake.subscriptions.get(second)?.status).toBe('canceled')
		expect([...fake.subscriptionRefunds]).toStrictEqual([second])
		expect(lines).toContainEqual(
			expect.objectContaining({
				level: 'error',
				message: 'A payer’s second subscription was canceled and refunded.',
			}),
		)
		await fake.deliver(test.url, '/stripe/events')
		await runJobs()
		const rows = await Subscription.findMany({}, M)
		expect(rows.map(({ status }) => status).toSorted()).toStrictEqual([
			'active',
			'canceled',
		])
	})
})

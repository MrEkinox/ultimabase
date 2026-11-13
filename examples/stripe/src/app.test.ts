// On Stripe accounts in memory: the catalog written once, then up to date;
// a user who subscribes, buys gems and spends them, each payment reaching
// the application as Stripe's signed events.
import { runJobs, testApplication } from '@ultimabase/testing'
import { fakeStripe, postEvent, thinEvent } from '@ultimabase/stripe/testing'
import { master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { Balance, Subscription, User } from './models.ts'
import { boost, buyGems, cancelPage, paid, subscribe } from './shop.ts'
import { deployCatalog } from './stripe.ts'

//#region keys
// The application's account: it reads the keys when `app.ts` loads.
const account = fakeStripe()
vi.stubEnv('STRIPE_SECRET_KEY', account.secret)
vi.stubEnv('STRIPE_WEBHOOK_SECRET', account.webhookSecret)
// In development, with a test key, the plugin brings the account to the
// catalog at start.
vi.stubEnv('NODE_ENV', 'development')
const { app } = await import('./app.ts')
//#endregion

const test = testApplication(app)
const M = { as: master }

it('writes the catalog to Stripe, then finds it up to date', async () => {
	const printed: string[] = []
	vi.spyOn(process.stdout, 'write').mockImplementation((line) => {
		printed.push(String(line))
		return true
	})
	//#region fake
	// A Stripe account in memory: its key reaches it, and no test reaches Stripe.
	const stripe = fakeStripe()
	await deployCatalog(stripe.secret, false)
	const prices = [...stripe.prices.values()].map(
		({ lookupKey, amount }) => `${String(lookupKey)}: ${String(amount)}`,
	)
	expect(prices).toEqual([
		'pro.monthly: 990',
		'pro.quarterly: 2700',
		'pro.yearly: 9900',
		'gems500: 499',
	])
	//#endregion
	expect(printed.join('')).toContain(
		'create the price pro.quarterly: 27.00 EUR every 3 months',
	)
	printed.length = 0
	await deployCatalog(stripe.secret, true)
	expect(printed).toEqual(['Stripe catalog (test mode): up to date.\n'])
})

it('sells a subscription and gems, then spends the gems', async () => {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	//#region pay
	// The test pays on Checkout; Stripe's signed events reach the webhook,
	// and their jobs write the subscription.
	account.pay(await subscribe(ada))
	await account.deliver(test.url)
	await runJobs()
	expect(await Subscription.findMany({}, M)).toMatchObject([
		{ product: 'pro', price: 'monthly', status: 'active' },
	])
	//#endregion
	expect(await cancelPage(ada)).toMatch(/^https:\/\/billing\.stripe\.test\//)
	//#region spend
	// Back on the success page before the webhook: the gems are there.
	const checkout = await buyGems(ada)
	account.pay(checkout)
	await paid(checkout.split('/').at(-1) ?? '', ada)
	await boost(ada)
	const gems = await Balance.findFirst({}, M)
	expect(gems).toMatchObject({ credit: 'blueGems', amount: 400 })
	//#endregion
	for (const _ of [1, 2, 3, 4]) await boost(ada)
	await expect(boost(ada)).rejects.toMatchObject({
		code: 'NOT_ENOUGH_CREDITS',
		details: { credit: 'blueGems', balance: 0, needed: 100 },
	})
	// The events that come after change nothing.
	await account.deliver(test.url)
	await runJobs()
	expect(await Balance.findFirst({}, M)).toMatchObject({ amount: 0 })
})

it('refuses an event Stripe did not sign', async () => {
	//#region event
	// An event of the test's own, signed with another secret.
	const event = thinEvent({
		type: 'customer.updated',
		object: { id: 'cus_1', type: 'customer' },
	})
	const response = await postEvent(test.url, event, { secret: 'whsec_other' })
	expect(response.status).toBe(401)
	//#endregion
})

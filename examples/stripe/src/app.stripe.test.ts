// Against a Stripe sandbox, as a nightly CI job runs it: the catalog Stripe
// holds is the code's, and a subscription gives its gems again a month later.
// It needs the sandbox's secret key in STRIPE_SECRET_KEY, and the catalog
// deployed there by `yarn deploy`.
import { randomBytes } from 'node:crypto'
import { stripeSandbox } from '@ultimabase/stripe/sandbox'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { afterAll, expect, it, vi } from 'vitest'
import { Balance, User } from './models.ts'
import { selling } from './stripe.ts'

//#region sandbox
// The test's own webhook secret: `deliver` signs Stripe's events with it.
const webhook = `whsec_${randomBytes(24).toString('base64')}`
const secret = process.env['STRIPE_SECRET_KEY']
const sandbox = stripeSandbox({ secret, webhook })
vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhook)
const { app } = await import('./app.ts')
const test = testApplication(app)
// Deletes the run's test clocks, and the customers of its addresses.
afterAll(async () => {
	await sandbox.cleanup()
})
//#endregion

//#region catalog
it('finds in Stripe the catalog the code declares', async () => {
	// Fails with the changes Stripe needs, as `yarn deploy --dry-run` prints them.
	await expect(sandbox.expectCatalog(selling)).resolves.toBeUndefined()
})
//#endregion

const poll = { timeout: 60_000, interval: 2_000 }

it('gives the gems again with each renewal', { timeout: 300_000 }, async () => {
	//#region payer
	const email = sandbox.email('renewal')
	const user = await User.create({ data: { email } }, { as: master })
	// A customer on a test clock of its own, with a card that pays.
	const payer = { model: User, id: user.id, email }
	const { customer, clock } = await sandbox.payer(payer)
	// Paid through the API, as Checkout would.
	const price = await sandbox.priceId('pro.monthly')
	await sandbox.client.subscriptions.create({ customer, items: [{ price }] })
	//#endregion
	//#region renewal
	const gems = async () => {
		// Stripe's events of the run's customers, then their jobs.
		await sandbox.deliver(test.url)
		const where = { owner: { is: { id: user.id } } }
		const [balance] = await Balance.findMany({ where }, { as: master })
		return balance?.amount ?? 0
	}
	await expect.poll(gems, poll).toBe(100)
	// A month later, Stripe renews it.
	await sandbox.advance(clock, { days: 32 })
	await expect.poll(gems, poll).toBe(200)
	//#endregion
})

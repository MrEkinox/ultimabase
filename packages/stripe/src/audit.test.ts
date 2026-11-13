// The daily audit (D-379): it logs a balance that is not the sum of its
// history, and a paid payment with no purchase, once the reconciliation had
// its chance.
import { runJobs, testApplication } from '@ultimabase/testing'
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import { stripe } from './index.ts'
import {
	Balance,
	billingApp,
	CreditHistory,
	gemPack,
	M,
	Purchase,
	urls,
	User,
} from './test/billing-app.ts'

beforeAll(() => {
	vi.stubEnv('NODE_ENV', 'development')
})

// Not `billingTest`: these tests break the ledger on purpose.
const { app, fake, lines } = billingApp()
const test = testApplication(app)

afterEach(() => {
	vi.useRealTimers()
	lines.length = 0
})

const minute = 60 * 1000
const hour = 60 * minute
let started = 0
beforeEach(() => {
	started = Date.now()
})
/** Moves the clock to `time` after the test began, and runs the jobs due. */
async function at(time: number) {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(started + time)
	await runJobs()
}
/** A payer who bought a gem pack: the payer, its payment and customer. */
async function bought(email: string) {
	const payer = await User.create({ data: { email } }, M)
	const url = await stripe.checkout({ payer, product: gemPack, ...urls })
	const payment = fake.pay(url)
	const customer = fake.checkouts.get(url.split('/').at(-1) ?? '')?.customerId
	await fake.deliver(test.url)
	await runJobs()
	return { payer, payment, customer }
}
const audited = () =>
	lines
		.filter(({ level }) => level === 'error')
		.map(({ message, details }) => ({ message, details }))

describe('the daily audit', () => {
	it('logs each balance that is not the sum of its history', async () => {
		const { payer: ada } = await bought('ada@example.com')
		const { payer: bob } = await bought('bob@example.com')
		await Balance.updateMany(
			{ where: { owner: { is: { id: ada.id } } }, data: { amount: 480 } },
			M,
		)
		const owner = { connect: { id: bob.id } }
		const move = { owner, credit: 'coins', change: 5, reason: 'gift' }
		await CreditHistory.create({ data: move }, M)
		await at(24 * hour + minute)
		const message = 'A balance is not the sum of its history.'
		expect(audited()).toEqual([
			{
				message,
				details: { owner: ada.id, credit: 'gems', balance: 480, history: 500 },
			},
			{
				message,
				details: { owner: bob.id, credit: 'coins', balance: 0, history: 5 },
			},
		])
	})

	it('logs a paid payment the reconciliation left with no purchase', async () => {
		await bought('ada@example.com')
		const bob = await bought('bob@example.com')
		// The hourly reconciliation read Bob's payment: its purchase is lost.
		await at(hour)
		await Purchase.deleteMany({ where: { stripeId: bob.payment } }, M)
		// Carol's is half an hour old: the reconciliation may still heal it.
		await at(23 * hour + 30 * minute)
		const carol = await bought('carol@example.com')
		await Purchase.deleteMany({ where: { stripeId: carol.payment } }, M)
		await at(24 * hour + minute)
		expect(audited()).toEqual([
			{
				message: 'A paid payment has no purchase.',
				details: {
					payment: bob.payment,
					customer: bob.customer,
					paidAt: fake.payments.get(bob.payment)?.paidAt.toISOString(),
				},
			},
		])
	})
})

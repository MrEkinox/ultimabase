// A payment at risk (D-388): with `risk`, an early fraud warning refunds
// its payment and ends its payer's subscriptions, a dispute ends them; the
// sync then writes the rows. Without it, nothing changes.
import { runJobs } from '@ultimabase/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stripe } from './index.ts'
import type { Line } from './test/billing-app.ts'
import {
	Balance,
	billingApp,
	billingTest,
	gemPack,
	M,
	pro,
	Purchase,
	Subscription,
	urls,
	User,
} from './test/billing-app.ts'
import { postEvent, thinEvent } from './testing.ts'

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'development')
})

type Fake = ReturnType<typeof billingApp>['fake']

/** A payer with a pro subscription and a gem pack: their ids. */
async function payer(fake: Fake, url: string) {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	const delivered = async () => {
		await fake.deliver(url)
		await runJobs()
	}
	const plan = { product: pro, price: 'monthly' as const }
	const subscription = fake.pay(
		await stripe.checkout({ payer: ada, ...plan, ...urls }),
	)
	const pack = fake.pay(
		await stripe.checkout({ payer: ada, product: gemPack, ...urls }),
	)
	await delivered()
	return { ada, subscription, pack, delivered }
}

const gemsOf = async (owner: { readonly id: string }) => {
	const where = { owner: { is: { id: owner.id } }, credit: 'gems' }
	return (await Balance.findFirst({ where }, M))?.amount
}
const rows = async () => ({
	subscriptions: (await Subscription.findMany({}, M)).map((one) => one.status),
	purchases: (await Purchase.findMany({}, M)).map((one) => one.status),
})
/** The warnings logged since the test began. */
const warned = (lines: readonly Line[], from: number) =>
	lines.slice(from).filter(({ level }) => level === 'warn')

describe('with risk', () => {
	const { app, fake, lines } = billingApp({
		risk: { earlyFraudWarning: 'refundAndCancel', dispute: 'cancel' },
	})
	const test = billingTest(app)
	let from = 0
	beforeEach(() => {
		from = lines.length
	})

	it('refunds a payment Radar warns of once, and ends its payer’s subscriptions', async () => {
		const { ada, subscription, pack, delivered } = await payer(fake, test.url)
		expect(await gemsOf(ada)).toBe(600)
		const warning = fake.warnFraud(pack)
		await delivered()
		expect(fake.payments.get(pack)?.refunded).toBe(4_90)
		expect(fake.subscriptions.get(subscription)?.status).toBe('canceled')
		expect(await rows()).toStrictEqual({
			subscriptions: ['canceled'],
			purchases: ['refunded'],
		})
		// The pack's gems go back; the period paid keeps its own.
		expect(await gemsOf(ada)).toBe(100)
		// The same warning again, as a retried job reads it: nothing more.
		const again = thinEvent({
			type: 'radar.early_fraud_warning.created',
			object: { id: warning, type: 'radar.early_fraud_warning' },
		})
		await postEvent(test.url, again, { secret: fake.webhookSecret })
		await runJobs()
		expect(fake.payments.get(pack)?.refunded).toBe(4_90)
		const message =
			'A payment is at risk: its payer’s subscriptions were canceled.'
		const customer = fake.payments.get(pack)?.customerId
		expect(warned(lines, from)).toStrictEqual([
			{
				level: 'warn',
				message,
				details: {
					event: 'radar.early_fraud_warning.created',
					charge: pack,
					customer,
					refunded: true,
					canceled: [subscription],
				},
			},
			{
				level: 'warn',
				message,
				details: {
					event: 'radar.early_fraud_warning.created',
					charge: pack,
					customer,
					refunded: false,
					canceled: [],
				},
			},
		])
	})

	it('refunds no payment refunded already, and still ends the subscriptions', async () => {
		const { ada, subscription, pack, delivered } = await payer(fake, test.url)
		fake.refund(pack)
		await delivered()
		fake.warnFraud(pack)
		await delivered()
		expect(fake.payments.get(pack)?.refunded).toBe(4_90)
		expect(await rows()).toStrictEqual({
			subscriptions: ['canceled'],
			purchases: ['refunded'],
		})
		expect(await gemsOf(ada)).toBe(100)
		expect(warned(lines, from).map(({ details }) => details)).toMatchObject([
			{ refunded: false, canceled: [subscription] },
		])
	})

	it('ends a disputed payment’s subscriptions, and refunds nothing', async () => {
		const { ada, subscription, pack, delivered } = await payer(fake, test.url)
		fake.openDispute(pack)
		await delivered()
		expect(fake.payments.get(pack)?.refunded).toBe(0)
		expect(await rows()).toStrictEqual({
			subscriptions: ['canceled'],
			purchases: ['paid'],
		})
		expect(await gemsOf(ada)).toBe(600)
		expect(warned(lines, from).map(({ details }) => details)).toMatchObject([
			{
				event: 'charge.dispute.created',
				charge: pack,
				refunded: false,
				canceled: [subscription],
			},
		])
	})

	it('leaves alone a payment of a customer the application does not hold', async () => {
		const { subscription } = await payer(fake, test.url)
		const stranger = 'cus_stranger'
		fake.payments.set('pi_stranger', {
			id: 'pi_stranger',
			customerId: stranger,
			product: null,
			quantity: 1,
			amount: 10_00,
			refunded: 0,
			disputeLost: false,
			paidAt: new Date(),
			receiptUrl: null,
		})
		fake.subscriptions.set('sub_stranger', {
			...(fake.subscriptions.get(subscription) ?? fakeMissing()),
			id: 'sub_stranger',
			customerId: stranger,
		})
		fake.warnFraud('pi_stranger')
		await fake.deliver(test.url)
		await runJobs()
		expect(fake.payments.get('pi_stranger')?.refunded).toBe(0)
		expect(fake.subscriptions.get('sub_stranger')?.status).toBe('active')
		expect(warned(lines, from)).toStrictEqual([])
	})
})

describe('without risk', () => {
	const { app, fake, lines } = billingApp()
	const test = billingTest(app)
	let from = 0
	beforeEach(() => {
		from = lines.length
	})

	it('changes nothing for a warning or a dispute', async () => {
		const { ada, subscription, pack, delivered } = await payer(fake, test.url)
		fake.warnFraud(pack)
		fake.openDispute(pack)
		await delivered()
		expect(fake.payments.get(pack)?.refunded).toBe(0)
		expect(fake.subscriptions.get(subscription)?.status).toBe('active')
		expect(await rows()).toStrictEqual({
			subscriptions: ['active'],
			purchases: ['paid'],
		})
		expect(await gemsOf(ada)).toBe(600)
		expect(warned(lines, from)).toStrictEqual([])
	})
})

function fakeMissing(): never {
	throw new Error('The fake holds no subscription.')
}

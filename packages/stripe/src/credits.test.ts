// Credits (D-374, D-377): a paid gem pack or subscription period gives its
// gems once, the application grants and spends them, and a full refund or a
// lost dispute takes them back.
import { runJobs, testApplication } from '@ultimabase/testing'
import { transaction } from 'ultimabase'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { stripe } from './index.ts'
import {
	Balance,
	billingApp,
	CreditHistory,
	gemPack,
	gems,
	M,
	pro,
	Purchase,
	urls,
	User,
} from './test/billing-app.ts'

beforeAll(() => {
	vi.stubEnv('NODE_ENV', 'development')
})

const { app, fake, lines } = billingApp()
const test = testApplication(app)

const delivered = async () => {
	await fake.deliver(test.url)
	await runJobs()
}
/** A payer who bought `packs` gem packs; their payments' ids. */
async function bought(packs = 1) {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	const payments: string[] = []
	for (let pack = 0; pack < packs; pack++) {
		const url = await stripe.checkout({ payer: ada, product: gemPack, ...urls })
		payments.push(fake.pay(url))
		await delivered()
	}
	return { ada, payments }
}
const gemsOf = async (owner: { readonly id: string }) => {
	const where = { owner: { is: { id: owner.id } }, credit: 'gems' }
	return (await Balance.findFirst({ where }, M))?.amount
}
const moves = async () =>
	(await CreditHistory.findMany({ orderBy: { createdAt: 'asc' } }, M)).map(
		({ credit, change, reason }) => `${reason} ${credit} ${String(change)}`,
	)

describe('a gem pack', () => {
	it('records its payment and gives its gems once', async () => {
		const { ada, payments } = await bought(2)
		const where = { payer: { is: { id: ada.id } } }
		expect(await Purchase.findMany({ where }, M)).toMatchObject(
			payments.map((stripeId) => ({
				stripeId,
				product: 'gemPack',
				quantity: 1,
				receiptUrl: `https://pay.stripe.test/receipts/${stripeId}`,
				amount: 4_90,
				refunded: 0,
				status: 'paid',
				note: null,
			})),
		)
		expect(await gemsOf(ada)).toBe(1_000)
		// A sync again gives nothing more.
		const [session] = [...fake.checkouts.values()].filter(
			({ reference }) => reference === ada.id,
		)
		await stripe.syncCheckout(session?.id ?? '', ada)
		expect(await gemsOf(ada)).toBe(1_000)
		expect(await moves()).toStrictEqual([
			'purchase gems 500',
			'purchase gems 500',
		])
	})

	it('gives its gems once a pack paid, and takes them all back', async () => {
		const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
		const product = gemPack
		const url = await stripe.checkout({
			payer: ada,
			product,
			quantity: 3,
			...urls,
		})
		const payment = fake.pay(url)
		await delivered()
		expect(await Purchase.findFirst({}, M)).toMatchObject({
			quantity: 3,
			amount: 14_70,
		})
		expect(await gemsOf(ada)).toBe(1_500)
		fake.refund(payment)
		await delivered()
		expect(await gemsOf(ada)).toBe(0)
		expect(await moves()).toStrictEqual([
			'purchase gems 1500',
			'refund gems -1500',
		])
	})

	it('takes its gems back after a full refund, not a partial one', async () => {
		const { ada, payments } = await bought(2)
		const [first = '', second = ''] = payments
		fake.refund(first, 1_00)
		await delivered()
		expect(await gemsOf(ada)).toBe(1_000)
		fake.refund(second)
		await delivered()
		expect(await gemsOf(ada)).toBe(500)
		expect(
			await Purchase.findMany({ orderBy: { paidAt: 'asc' } }, M),
		).toMatchObject([
			{ refunded: 1_00, status: 'paid' },
			{ refunded: 4_90, status: 'refunded' },
		])
	})

	it('takes back what is left of a lost dispute’s gems', async () => {
		const { ada, payments } = await bought()
		await stripe.spend(ada, gems(200), { reason: 'boost' })
		fake.loseDispute(payments[0] ?? '')
		await delivered()
		expect(await gemsOf(ada)).toBe(0)
		expect(await moves()).toStrictEqual([
			'purchase gems 500',
			'boost gems -200',
			'refund gems -300',
		])
		const warned = lines.find(({ message }) =>
			message.includes('already spent'),
		)
		expect(warned).toMatchObject({
			level: 'warn',
			message:
				'gems of a refunded payment were already spent: they stay spent.',
			details: { credit: 'gems', spent: 200 },
		})
		// A second dispute event changes nothing.
		fake.loseDispute(payments[0] ?? '')
		await delivered()
		expect(await moves()).toHaveLength(3)
	})
})

/** A payer subscribed to pro's monthly price; its subscription's id. */
async function subscribed(options: { quantity?: number; trialDays?: number }) {
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	const price = 'monthly' as const
	const checkout = { payer: ada, product: pro, price, ...options, ...urls }
	const url = await stripe.checkout(checkout)
	const id = fake.pay(url)
	await delivered()
	return { ada, id, url }
}
const lastInvoice = () => [...fake.invoices.keys()].at(-1) ?? ''
const day = 24 * 60 * 60 * 1000

describe('a subscription', () => {
	it('gives each paid period’s gems, times its quantity, once', async () => {
		const { ada, id } = await subscribed({ quantity: 2 })
		expect(await gemsOf(ada)).toBe(200)
		fake.renew(id)
		await delivered()
		// A sync again gives nothing more.
		fake.update(id, {})
		await delivered()
		expect(await gemsOf(ada)).toBe(400)
		expect(await moves()).toStrictEqual([
			'subscription gems 200',
			'subscription gems 200',
		])
	})

	it('gives nothing for a trial, nor for a period that ended', async () => {
		const { ada, id } = await subscribed({ trialDays: 14 })
		expect(await gemsOf(ada)).toBeUndefined()
		fake.renew(id)
		await delivered()
		expect(await gemsOf(ada)).toBe(100)
		// A period paid 40 days ago, read now, as when gives came later.
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - 40 * day })
		const url = await stripe.checkout({
			payer: bob,
			product: pro,
			...urls,
			price: 'monthly',
		})
		fake.pay(url)
		vi.useRealTimers()
		await stripe.syncCheckout(url.split('/').at(-1) ?? '', bob)
		await delivered()
		expect(await gemsOf(bob)).toBeUndefined()
	})

	it('takes back a refunded or lost period’s gems, even after it ended', async () => {
		const { ada, id } = await subscribed({})
		const first = lastInvoice()
		const second = fake.renew(id)
		await delivered()
		fake.refund(second)
		await delivered()
		expect(await gemsOf(ada)).toBe(100)
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 70 * day })
		fake.loseDispute(first)
		await delivered()
		vi.useRealTimers()
		expect(await gemsOf(ada)).toBe(0)
		expect(await moves()).toStrictEqual([
			'subscription gems 100',
			'subscription gems 100',
			'refund gems -100',
			'refund gems -100',
		])
	})
})

describe('stripe.grant', () => {
	it('adds to the balance without a payment, in the caller’s transaction', async () => {
		const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
		await expect(
			transaction(async () => {
				await stripe.grant(ada, gems(50), { reason: 'welcome' })
				throw new Error('The sign-up failed.')
			}),
		).rejects.toThrow('The sign-up failed.')
		expect(await gemsOf(ada)).toBeUndefined()
		await stripe.grant(ada, [gems(50), gems(25)], { reason: 'welcome' })
		expect(await gemsOf(ada)).toBe(75)
		expect(await moves()).toStrictEqual(['welcome gems 75'])
	})
})

describe('stripe.spend', () => {
	it('lowers the balance, in the caller’s transaction', async () => {
		const { ada } = await bought()
		await expect(
			transaction(async () => {
				await stripe.spend(ada, [gems(100), gems(50)], { reason: 'boost' })
				throw new Error('The boost failed.')
			}),
		).rejects.toThrow('The boost failed.')
		expect(await gemsOf(ada)).toBe(500)
		await stripe.spend(ada, [gems(100), gems(50)], { reason: 'boost' })
		expect(await gemsOf(ada)).toBe(350)
		expect(await moves()).toStrictEqual([
			'purchase gems 500',
			'boost gems -150',
		])
	})

	it('refuses what the balance lacks, changing nothing', async () => {
		const { ada } = await bought()
		await expect(
			stripe.spend(ada, gems(501), { reason: 'boost' }),
		).rejects.toMatchObject({
			code: 'NOT_ENOUGH_CREDITS',
			details: { credit: 'gems', balance: 500, needed: 501 },
		})
		const bob = await User.create({ data: { email: 'bob@example.com' } }, M)
		await expect(
			stripe.spend(bob, gems(1), { reason: 'boost' }),
		).rejects.toMatchObject({
			code: 'NOT_ENOUGH_CREDITS',
			details: { balance: 0 },
		})
		expect(await gemsOf(ada)).toBe(500)
	})
})

// Credits (D-374): a paid gem pack gives its gems once, the application
// spends them, and a full refund or a lost dispute takes them back.
import { runJobs, testApplication } from '@ultimabase/testing'
import { transaction } from 'ultimabase'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { stripe } from './index.ts'
import { M as master, StripeCreditEntry } from './models.ts'
import {
	Balance,
	billingApp,
	gemPack,
	gems,
	M,
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
	(
		await StripeCreditEntry.findMany({ orderBy: { createdAt: 'asc' } }, master)
	).map(({ credit, change, reason }) => `${reason} ${credit} ${String(change)}`)

describe('a gem pack', () => {
	it('records its payment and gives its gems once', async () => {
		const { ada, payments } = await bought(2)
		const where = { payer: { is: { id: ada.id } } }
		expect(await Purchase.findMany({ where }, M)).toMatchObject(
			payments.map((stripeId) => ({
				stripeId,
				product: 'gemPack',
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
		expect(await Purchase.findFirst({}, M)).toMatchObject({ amount: 14_70 })
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

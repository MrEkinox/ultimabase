// `applyStripeCatalog` (D-372 point 4): a deploy script prints the plan, a
// line a change, and applies it unless it runs dry.
import { describe, expect, it, vi } from 'vitest'
import { addFake, gatewayOf } from './accounts.ts'
import { type StripeCatalogOptions, applyStripeCatalog } from './apply.ts'
import { defineProduct } from './product.ts'
import { fakeStripe } from './testing.ts'

const pro = defineProduct({
	key: 'pro',
	name: 'Pro',
	prices: { monthly: { amount: 9_90, every: 'month' } },
})

const options = (secret: string | undefined): StripeCatalogOptions => ({
	secret,
	currency: 'eur',
	products: [pro],
	portal: { returnUrl: 'https://app.test/shop' },
})

/** `applyStripeCatalog` with wrong options: spread, they keep the type. */
const refused = (wrong: object) =>
	applyStripeCatalog({ ...options('sk_test_x'), ...wrong })

/** What `applyStripeCatalog` printed. */
const printed = async (run: () => Promise<void>) => {
	const lines: string[] = []
	vi.spyOn(process.stdout, 'write').mockImplementation((line) => {
		lines.push(String(line))
		return true
	})
	await run()
	return lines.join('')
}

describe('applyStripeCatalog', () => {
	it('prints the plan and applies it, once', async () => {
		const fake = fakeStripe()
		expect(
			await printed(() =>
				applyStripeCatalog({ ...options(fake.secret), dryRun: false }),
			),
		).toBe(`Stripe catalog (test mode): 3 changes:
  create the product pro: "Pro"
  create the price pro.monthly: 9.90 EUR every month
  create the customer portal configuration
Stripe catalog: applied.
`)
		expect(fake.prices.get('price_2')).toMatchObject({
			taxBehavior: 'inclusive',
		})
		expect(await printed(() => applyStripeCatalog(options(fake.secret)))).toBe(
			'Stripe catalog (test mode): up to date.\n',
		)
		expect(
			await printed(() =>
				applyStripeCatalog({
					...options(fake.secret),
					portal: { returnUrl: 'https://app.test/account' },
				}),
			),
		).toBe(`Stripe catalog (test mode): 1 change:
  update the customer portal configuration bpc_3
Stripe catalog: applied.
`)
	})

	it('changes nothing in a dry run', async () => {
		const fake = fakeStripe()
		expect(
			await printed(() =>
				applyStripeCatalog({
					...options(fake.secret),
					taxBehavior: 'exclusive',
					dryRun: true,
				}),
			),
		).toContain('Stripe catalog (test mode): 3 changes, dry run:')
		expect(fake.products.size).toBe(0)
	})

	it('names a live key', async () => {
		const fake = fakeStripe()
		// A live key of the fake: what is printed reads the key alone.
		addFake('sk_live_fake', gatewayOf(fake.secret))
		expect(
			await printed(() =>
				applyStripeCatalog({ ...options('sk_live_fake'), dryRun: true }),
			),
		).toContain('Stripe catalog (live mode): 3 changes, dry run:')
	})

	it('refuses options Stripe would refuse, naming the option', async () => {
		await expect(refused({ secret: undefined })).rejects.toThrow(
			"applyStripeCatalog: secret is the account's secret key, sk_….",
		)
		await expect(refused({ currency: 'EUR' })).rejects.toThrow(
			'applyStripeCatalog: currency is a lowercase ISO code, as eur.',
		)
		await expect(refused({ taxBehavior: 'included' })).rejects.toThrow(
			"applyStripeCatalog: taxBehavior is 'inclusive' or 'exclusive'.",
		)
		await expect(refused({ products: pro })).rejects.toThrow(
			'applyStripeCatalog: products lists what defineProduct returns.',
		)
		await expect(refused({ products: [pro, pro] })).rejects.toThrow(
			'applyStripeCatalog: two products have the key pro.',
		)
		await expect(refused({ dry: true })).rejects.toThrow(
			'applyStripeCatalog takes no dry.',
		)
		await expect(refused({ portal: {} })).rejects.toThrow(
			'portal: returnUrl is an absolute URL.',
		)
		await expect(
			refused({
				portal: { returnUrl: 'https://app.test', termsUrl: '/terms' },
			}),
		).rejects.toThrow('portal: termsUrl is an absolute URL.')
		await expect(
			refused({ portal: { returnUrl: 'https://app.test', cancel: 'never' } }),
		).rejects.toThrow("portal: cancel is 'atPeriodEnd' or 'now'.")
		await expect(
			refused({ portal: { returnUrl: 'https://app.test', upgrades: 1 } }),
		).rejects.toThrow("portal: upgrades is 'invoiceNow' or 'nextInvoice'.")
		for (const cancelReasons of [[], ['bored'], 'unused']) {
			await expect(
				refused({ portal: { returnUrl: 'https://app.test', cancelReasons } }),
			).rejects.toThrow("portal: cancelReasons lists some of 'too_expensive',")
		}
	})
})

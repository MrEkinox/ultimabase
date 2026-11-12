// The catalog on a Stripe account in memory: written once, then up to date.
import { testApplication } from '@ultimabase/testing'
import { fakeStripe } from '@ultimabase/stripe/testing'
import { expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { deployCatalog } from './stripe.ts'

testApplication(app)

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

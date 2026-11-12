// The catalog's values (D-372): a credit is a function of an amount, a
// product a subscription or a one-time product; both refuse, naming
// themselves, what Stripe would refuse.
import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineCredit } from './credit.ts'
import { defineProduct } from './product.ts'

const blueGems = defineCredit({ key: 'blueGems' })

/** `defineProduct` of a definition its types refuse. */
const wrong = (definition: unknown) => () =>
	// @ts-expect-error: the definition under test is wrong.
	defineProduct(definition)

/** A subscription of `prices`. */
const prices = (value: unknown) =>
	wrong({ key: 'pro', name: 'Pro', prices: value })

/** A one-time product of `price` that gives `gives`. */
const oneTime = (price: unknown, gives?: unknown) =>
	wrong({ key: 'gems', name: 'Gems', price, gives })
const pinkGems = defineCredit({ key: 'pinkGems' })

describe('defineCredit', () => {
	it('gives an amount of the credit, a positive integer', () => {
		expect(blueGems.key).toBe('blueGems')
		expect(blueGems(500)).toEqual({ credit: 'blueGems', amount: 500 })
		expect(Object.isFrozen(blueGems(1))).toBe(true)
		expectTypeOf(blueGems(1).credit).toEqualTypeOf<'blueGems'>()
		expect(() => blueGems(0)).toThrow(
			'blueGems(0): an amount is a positive integer.',
		)
		expect(() => blueGems(1.5)).toThrow('blueGems(1.5)')
		expect(() => blueGems(Number.MAX_SAFE_INTEGER + 1)).toThrow('blueGems(')
	})

	it('refuses a definition that is not { key }', () => {
		// @ts-expect-error: a credit is declared with an object.
		expect(() => defineCredit('blueGems')).toThrow(
			'defineCredit takes an object.',
		)
		// @ts-expect-error: a credit has a key and nothing else.
		expect(() => defineCredit({ key: 'gold', name: 'Gold' })).toThrow(
			'defineCredit(gold) takes no name.',
		)
		expect(() => defineCredit({ key: 'blue.gems' })).toThrow(
			'defineCredit: "blue.gems" is not a key: letters, digits, - and _ only.',
		)
	})
})

describe('defineProduct', () => {
	it('declares a subscription with its recurring prices', () => {
		const pro = defineProduct({
			key: 'pro',
			name: 'Pro',
			taxCode: 'txcd_10103000',
			prices: {
				monthly: { amount: 9_90, every: 'month' },
				quarterly: { amount: 27_00, every: 'month', everyCount: 3 },
				yearly: { amount: 99_00, every: 'year' },
			},
		})
		expect(pro).toEqual({
			key: 'pro',
			name: 'Pro',
			taxCode: 'txcd_10103000',
			prices: {
				monthly: { amount: 9_90, every: 'month' },
				quarterly: { amount: 27_00, every: 'month', everyCount: 3 },
				yearly: { amount: 99_00, every: 'year' },
			},
		})
		expect(Object.isFrozen(pro)).toBe(true)
		expectTypeOf(pro.key).toEqualTypeOf<'pro'>()
		expectTypeOf<keyof typeof pro.prices>().toEqualTypeOf<
			'monthly' | 'quarterly' | 'yearly'
		>()
	})

	it('declares a one-time product and the credits it gives', () => {
		const gems = defineProduct({
			key: 'gems500',
			name: '500 blue gems',
			price: { amount: 4_99 },
			gives: [blueGems(500), pinkGems(10)],
		})
		expect(gems).toEqual({
			key: 'gems500',
			name: '500 blue gems',
			price: { amount: 4_99 },
			gives: [
				{ credit: 'blueGems', amount: 500 },
				{ credit: 'pinkGems', amount: 10 },
			],
		})
		expect(
			defineProduct({ key: 'setup', name: 'Setup', price: { amount: 50_00 } }),
		).toEqual({
			key: 'setup',
			name: 'Setup',
			price: { amount: 50_00 },
			gives: [],
		})
	})

	it('refuses a product that is neither, or both', () => {
		expect(() =>
			// @ts-expect-error: a product has prices or a price.
			defineProduct({ key: 'pro', name: 'Pro' }),
		).toThrow(
			'defineProduct(pro): a product has either prices, recurring, or one price, paid once.',
		)
		expect(() =>
			defineProduct({
				key: 'pro',
				name: 'Pro',
				// @ts-expect-error: not both.
				prices: { monthly: { amount: 9_90, every: 'month' } },
				price: { amount: 9_90 },
			}),
		).toThrow('defineProduct(pro): a product has either prices')
		expect(
			wrong({
				key: 'pro',
				name: 'Pro',
				prices: { monthly: { amount: 9_90, every: 'month' } },
				gives: [blueGems(1)],
			}),
		).toThrow('defineProduct(pro): gives goes with a one-time price.')
	})

	it('refuses a bad key, name or tax code', () => {
		// @ts-expect-error: a product is declared with an object.
		expect(() => defineProduct(null)).toThrow('defineProduct takes an object.')
		expect(() =>
			defineProduct({ key: 'pro.plus', name: 'Pro', price: { amount: 1 } }),
		).toThrow('defineProduct: "pro.plus" is not a key')
		expect(() =>
			defineProduct({ key: 'pro', name: ' ', price: { amount: 1 } }),
		).toThrow(
			'defineProduct(pro): name is what Checkout and the invoices show.',
		)
		expect(
			wrong({ key: 'pro', name: 'Pro', taxCode: 1, price: { amount: 1 } }),
		).toThrow('defineProduct(pro): taxCode is a Stripe Tax code')
		// A misspelt option is refused (D-370).
		expect(
			wrong({ key: 'pro', name: 'Pro', price: { amount: 1 }, tax: 'x' }),
		).toThrow('defineProduct(pro) takes no tax.')
	})

	it('refuses prices Stripe would refuse, naming the price', () => {
		expect(prices('monthly')).toThrow(
			'defineProduct(pro): prices holds the recurring prices by name.',
		)
		expect(prices({})).toThrow(
			'defineProduct(pro): prices holds at least one price.',
		)
		expect(prices({ 'a.b': { amount: 1, every: 'month' } })).toThrow(
			'defineProduct(pro): "a.b" is not a key',
		)
		expect(prices({ monthly: { amount: 9.9, every: 'month' } })).toThrow(
			"defineProduct(pro).monthly: the amount 9.9 is not a positive integer, in the currency's smallest unit.",
		)
		expect(prices({ monthly: { amount: 990, every: 'moon' } })).toThrow(
			"defineProduct(pro).monthly: every is 'day', 'week', 'month' or 'year'.",
		)
		expect(
			prices({ monthly: { amount: 990, every: 'month', everyCount: 37 } }),
		).toThrow(
			'defineProduct(pro).monthly: everyCount is an integer from 1 to 36.',
		)
		expect(
			prices({ weekly: { amount: 990, every: 'week', everyCount: 0 } }),
		).toThrow(
			'defineProduct(pro).weekly: everyCount is an integer from 1 to 156.',
		)
		expect(
			prices({ monthly: { amount: 990, every: 'month', trial: 7 } }),
		).toThrow('defineProduct(pro).monthly takes no trial.')
		// The customer portal takes one price per interval of a product.
		expect(
			prices({
				monthly: { amount: 990, every: 'month' },
				cheaper: { amount: 490, every: 'month', everyCount: 1 },
			}),
		).toThrow(
			'defineProduct(pro): monthly and cheaper both bill every 1 month; a product has one price per interval.',
		)
	})

	it('refuses a one-time price or credits Stripe would refuse', () => {
		expect(oneTime({ amount: -1 })).toThrow(
			'defineProduct(gems): the amount -1 is not a positive integer',
		)
		expect(oneTime({ amount: 1, every: 'month' })).toThrow(
			'defineProduct(gems) takes no every.',
		)
		expect(oneTime({ amount: 1 }, blueGems(1))).toThrow(
			'defineProduct(gems): gives lists credits, as [blueGems(500)].',
		)
		expect(oneTime({ amount: 1 }, ['blueGems'])).toThrow(
			'defineProduct(gems): gives lists credits',
		)
		expect(oneTime({ amount: 1 }, [{ credit: 'blueGems', amount: 0 }])).toThrow(
			'defineProduct(gems) gives blueGems: the amount 0 is not a positive integer',
		)
		expect(oneTime({ amount: 1 }, [blueGems(1), blueGems(2)])).toThrow(
			'defineProduct(gems): gives blueGems twice.',
		)
	})
})

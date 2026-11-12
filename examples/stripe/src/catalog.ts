// What the application sells: subscriptions, and gems paid once.
//#region catalog
import { defineCredit, defineProduct } from '@ultimabase/stripe'

export const blueGems = defineCredit({ key: 'blueGems' })

export const pro = defineProduct({
	key: 'pro',
	name: 'Pro',
	// Stripe Tax's code of software as a service.
	taxCode: 'txcd_10103000',
	prices: {
		monthly: { amount: 9_90, every: 'month' },
		quarterly: { amount: 27_00, every: 'month', everyCount: 3 },
		yearly: { amount: 99_00, every: 'year' },
	},
})

export const gems500 = defineProduct({
	key: 'gems500',
	name: '500 blue gems',
	price: { amount: 4_99 },
	gives: [blueGems(500)],
})
//#endregion

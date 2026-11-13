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
		// Each paid period gives its gems: a trial gives none.
		monthly: { amount: 9_90, every: 'month', gives: [blueGems(100)] },
		quarterly: {
			amount: 27_00,
			every: 'month',
			everyCount: 3,
			gives: [blueGems(300)],
		},
		yearly: { amount: 99_00, every: 'year', gives: [blueGems(1_200)] },
	},
})
//#endregion

//#region pack
export const gems500 = defineProduct({
	key: 'gems500',
	name: '500 blue gems',
	price: { amount: 4_99 },
	gives: [blueGems(500)],
})
//#endregion

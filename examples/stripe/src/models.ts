// The users, and what they pay: the plugin writes the three billing models
// from Stripe's events; the application reads them.
//#region models
import {
	defineBalance,
	definePurchase,
	defineSubscription,
} from '@ultimabase/stripe'
import { defineModel } from 'ultimabase'

export const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string({ unique: true }) }),
})

// A row a subscription: its product, price, status and period.
export const Subscription = defineSubscription({
	name: 'Subscription',
	payer: () => User,
})
// A row a payment made once, refunds included.
export const Purchase = definePurchase({
	name: 'Purchase',
	payer: () => User,
})
// A row a credit a user holds: the gems a purchase gave, less those spent.
export const Balance = defineBalance({ name: 'Balance', owner: () => User })
//#endregion

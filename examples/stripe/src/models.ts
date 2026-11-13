// The users, and what they pay: the plugin writes the four billing models
// from Stripe's events; the application reads them, each user its own.
import { isOwner } from '@ultimabase/auth'
import {
	defineBalance,
	defineCreditHistory,
	definePurchase,
	defineSubscription,
} from '@ultimabase/stripe'
import { defineModel, master } from 'ultimabase'

export const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string({ unique: true }) }),
})

//#region models
// A row a payment made once, refunds included.
export const Purchase = definePurchase({
	name: 'Purchase',
	payer: () => User,
}).with({ access: { read: isOwner('payer') } })
// A row a credit a user holds: the gems given, less those spent.
export const Balance = defineBalance({
	name: 'Balance',
	owner: () => User,
}).with({ access: { read: isOwner('owner') } })
// A row a move of credits: given, spent or taken back, and why.
export const CreditHistory = defineCreditHistory({
	name: 'CreditHistory',
	owner: () => User,
}).with({ access: { read: isOwner('owner') } })
//#endregion

//#region subscription
// A row a subscription: its product, price, amount, status and period.
export const Subscription = defineSubscription({
	name: 'Subscription',
	payer: () => User,
}).with({
	access: { read: isOwner('payer') },
	hooks: {
		// Once the plugin's write commits: a subscription that was not
		// canceled now is.
		afterUpdateCommit: async ({ record, previous }) => {
			if (previous.status === 'canceled' || record.status !== 'canceled') {
				return
			}
			const where = { id: record.payer.id }
			const user = await User.findUniqueOrThrow({ where }, { as: master })
			mails.push({ to: user.email, text: `Your ${record.product} ended.` })
		},
	},
})
//#endregion

/** The mails the application sent: stands for its mailer. */
export const mails: { readonly to: string; readonly text: string }[] = []

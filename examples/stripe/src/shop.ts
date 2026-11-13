// The server code that sells: a user subscribes on Stripe's Checkout, comes
// back to the success page, manages the subscription on Stripe's portal,
// and spends the gems a payment or the application gave.
import { stripe } from '@ultimabase/stripe'
import type { Identity } from 'ultimabase'
import { blueGems, gems500, pro } from './catalog.ts'
import { CreditHistory, Subscription } from './models.ts'

type Payer = { readonly id: string }

//#region checkout
/** The Checkout page where `user` subscribes to Pro, billed each month. */
export const subscribe = (user: Payer) =>
	stripe.checkout({
		payer: user,
		product: pro,
		price: 'monthly',
		// A checkbox the user ticks, with the application's text.
		terms: {
			acceptance:
				'I accept the [terms of sale](https://app.example.com/terms).',
		},
		// Stripe fills in the session's id.
		successUrl: 'https://app.example.com/paid?session={CHECKOUT_SESSION_ID}',
		cancelUrl: 'https://app.example.com/pricing',
	})

/** The Checkout page where `user` buys 500 blue gems. */
export const buyGems = (user: Payer) =>
	stripe.checkout({
		payer: user,
		product: gems500,
		successUrl: 'https://app.example.com/paid?session={CHECKOUT_SESSION_ID}',
		cancelUrl: 'https://app.example.com/shop',
	})
//#endregion

//#region paid
/** The success page: writes what `user` paid, before Stripe's event. */
export const paid = (session: string, user: Payer) =>
	stripe.syncCheckout(session, user)
//#endregion

//#region portal
/** Stripe's portal, open on the cancellation of `user`'s subscription. */
export const cancelPage = (user: Payer) =>
	stripe.portal({ payer: user, cancel: {} })
//#endregion

//#region grant
/** 50 gems for a new user, without a payment. */
export const welcome = (user: Payer) =>
	stripe.grant(user, blueGems(50), { reason: 'welcome' })
//#endregion

//#region spend
/** Spends 100 of `user`'s gems: `NOT_ENOUGH_CREDITS` when they lack them. */
export const boost = (user: Payer) =>
	stripe.spend(user, blueGems(100), { reason: 'boost' })
//#endregion

//#region page
/**
 * The account page of a function's `caller`: the plan as they pay it, and
 * the moves of their gems. Their rules let them read their own rows only.
 */
export async function account(caller: Identity) {
	const as = { as: caller }
	const plans = await Subscription.findMany({}, as)
	const moves = await CreditHistory.findMany(
		{ orderBy: { createdAt: 'desc' } },
		as,
	)
	return {
		// 9.90 EUR every month: what the row holds, whatever the catalog says.
		plans: plans.map(
			(plan) =>
				`${(plan.amount / 100).toFixed(2)} EUR every ${plan.every}: ${plan.status}`,
		),
		moves: moves.map(({ change, reason }) => `${change} ${reason}`),
	}
}
//#endregion

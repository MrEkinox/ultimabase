// The server code that sells: a user subscribes on Stripe's Checkout, comes
// back to the success page, manages the subscription on Stripe's portal, and
// spends the gems a purchase gave.
import { stripe } from '@ultimabase/stripe'
import { blueGems, gems500, pro } from './catalog.ts'

type Payer = { readonly id: string }

//#region checkout
/** The Checkout page where `user` subscribes to Pro, billed each month. */
export const subscribe = (user: Payer) =>
	stripe.checkout({
		payer: user,
		product: pro,
		price: 'monthly',
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

//#region spend
/** Spends 100 of `user`'s gems: `NOT_ENOUGH_CREDITS` when they lack them. */
export const boost = (user: Payer) =>
	stripe.spend(user, blueGems(100), { reason: 'boost' })
//#endregion

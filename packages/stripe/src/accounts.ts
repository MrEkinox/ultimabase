// The Stripe account of a secret key. `fakeStripe()` of
// `@ultimabase/stripe/testing` registers its own key here, so a test hands
// that key to the code under test as it would hand a real one: no option
// of the public API exists for tests alone, and each fake is its own account.
import type { BillingGateway } from './billing-gateway.ts'
import { sdkBilling } from './sdk-billing.ts'
import { type StripeGateway, sdkGateway, stripeClient } from './gateway.ts'

/** Everything the plugin asks a Stripe account. */
export type Gateway = StripeGateway & BillingGateway

const fakes = new Map<string, Gateway>()

/** Makes `secret` reach `gateway` instead of Stripe. */
export const addFake = (secret: string, gateway: Gateway): void => {
	fakes.set(secret, gateway)
}

/** The gateway of `secret`: a fake's, or Stripe's API. */
export const gatewayOf = (secret: string): Gateway => {
	const fake = fakes.get(secret)
	if (fake !== undefined) return fake
	const client = stripeClient(secret)
	return { ...sdkGateway(client), ...sdkBilling(client) }
}

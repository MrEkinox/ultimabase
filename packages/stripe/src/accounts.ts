// The Stripe account of a secret key. `fakeStripe()` of
// `@ultimabase/stripe/testing` registers its own key here, so a test hands
// that key to the code under test as it would hand a real one: no option
// of the public API exists for tests alone, and each fake is its own account.
import { type StripeGateway, sdkGateway, stripeClient } from './gateway.ts'

const fakes = new Map<string, StripeGateway>()

/** Makes `secret` reach `gateway` instead of Stripe. */
export const addFake = (secret: string, gateway: StripeGateway): void => {
	fakes.set(secret, gateway)
}

/** The gateway of `secret`: a fake's, or Stripe's API. */
export const gatewayOf = (secret: string): StripeGateway =>
	fakes.get(secret) ?? sdkGateway(stripeClient(secret))

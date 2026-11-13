---
'@ultimabase/stripe': minor
---

New package `@ultimabase/stripe`: `defineProduct` and `defineCredit` declare a catalog in code, and `applyStripeCatalog` brings a Stripe account and its customer portal to it from a deploy script, printing the plan first. `stripePlugin` sells the catalog: `stripe.checkout` opens Stripe's Checkout, `stripe.portal` its customer portal, and `stripe.syncCheckout` writes a payment as the payer comes back. Its webhook stores Stripe's thin events, and its jobs write them to the models `defineSubscription`, `definePurchase` and `defineBalance` declare, without holding a lock while they read Stripe; an hourly job reads Stripe's events to catch one the webhook missed, and with `oneSubscription` a second subscription is canceled and refunded; `stripe.spend` spends the credits a purchase gave. `fakeStripe` from `@ultimabase/stripe/testing` is a Stripe account in memory for tests, whose Checkouts a test pays and whose signed events it delivers to the webhook.

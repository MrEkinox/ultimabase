---
'@ultimabase/stripe': minor
---

Checkout and the portal speak the payer's `locale` (D-382). `stripe.checkout`'s `terms` takes
`{ acceptance }`, the application's text beside the checkbox; an account with Managed Payments
refuses it (D-383). The payer's model lists `stripePayer()` in its `use`, and an update that changes
its profile reaches Stripe by a job; the application does not start without it (D-385). `portal.cancelReasons` asks a
payer why they cancel (D-384). A sync logs at error level a subscription to a price outside the
catalog, and a payment for a product the catalog no longer holds; the row of such a subscription
still ends when Stripe ends it (D-386). `defineSubscription` and `definePurchase` take the
application's enums for `product` and `price`, so each row is typed; an enum that misses a value of
the catalog stops the application at start (D-387).

# @ultimabase/stripe

## 0.8.0

### Minor Changes

- 057365e: Checkout and the portal speak the payer's `locale` (D-382). `stripe.checkout`'s `terms` takes
  `{ acceptance }`, the application's text beside the checkbox; an account with Managed Payments
  refuses it (D-383). The payer's model lists `stripePayer()` in its `use`, and an update that changes
  its profile reaches Stripe by a job; the application does not start without it (D-385). `portal.cancelReasons` asks a
  payer why they cancel (D-384). A sync logs at error level a subscription to a price outside the
  catalog, and a payment for a product the catalog no longer holds; the row of such a subscription
  still ends when Stripe ends it (D-386). `defineSubscription` and `definePurchase` take the
  application's enums for `product` and `price`, so each row is typed; an enum that misses a value of
  the catalog stops the application at start (D-387).
- 10e523a: `stripePlugin({ catalog: true })` adds the public query `stripeCatalog`, in GraphQL and at
  `GET /api/functions/stripeCatalog`: the subscriptions with their prices, and the one-time
  purchases, in their declared order, with their amounts, intervals, trials and credits. It is
  served from the code, without calling Stripe, and typed by the billing models' enums.
  `stripe.catalog()` returns the same value on the server.
- b629458: New package `@ultimabase/stripe`: `defineProduct` and `defineCredit` declare a catalog in code, and `applyStripeCatalog` brings a Stripe account and its customer portal to it from a deploy script, printing the plan first. `stripePlugin` sells the catalog: `stripe.checkout` opens Stripe's Checkout, `stripe.portal` its customer portal, where a card the payer replaces pays the next renewals, and `stripe.syncCheckout` writes a payment as the payer comes back. Its webhook stores Stripe's thin events, and its jobs write them to the models `defineSubscription`, `definePurchase`, `defineBalance` and `defineCreditHistory` declare, without holding a lock while they read Stripe; an hourly job reads Stripe's events to catch one the webhook missed, and a daily job logs a balance that is not the sum of its history or a payment left with no purchase, and with `oneSubscription` a second subscription is canceled and refunded; a purchase, and each paid period of a subscription, gives its credits, `stripe.grant` gives them without a payment and `stripe.spend` spends them, each move written to the credit history. `fakeStripe` from `@ultimabase/stripe/testing` is a Stripe account in memory for tests, whose Checkouts a test pays and whose signed events it delivers to the webhook.
- e289391: `stripe.portal` names the page it opens with `open`, one at a time (D-394), and opens a new one:
  `open: 'paymentMethod'`, the form that changes the payer's payment method, which returns to
  `returnUrl` once done (D-389).

  Breaking: `change` and `cancel` give way to `open`.

  ```ts
  // Before
  stripe.portal({ payer, change: { product: pro, price: 'yearly' } })
  stripe.portal({ payer, cancel: { subscription } })
  // After
  stripe.portal({ payer, open: 'change', product: pro, price: 'yearly' })
  stripe.portal({ payer, open: 'cancel', subscription })
  ```

- e289391: A recurring price takes `trialDays`, from 1 to 730: `stripe.checkout` gives it when the payer has
  never subscribed, and none after (D-391). The call's `trialDays` still wins, and `trialDays: 0` now
  gives no trial.
- 22e0616: `stripePlugin`'s `risk` acts on a payment at risk, off unless set (D-388): `earlyFraudWarning:
'refundAndCancel'` refunds the payment Radar warns of, once, and `dispute: 'cancel'` leaves a
  disputed payment to its dispute; both end the payer's live subscriptions at once, without
  proration, and log a warning. The fake's `warnFraud` and `openDispute` put a test's payment at risk.
- e289391: `stripe.checkout`'s `terms.acceptance` takes texts by locale, such as
  `{ default: '…', fr: '…', 'pt-BR': '…' }`: the Checkout page's language picks one, then its language
  part, then `default` (D-390). A key that is not a canonical locale is refused.

### Patch Changes

- 01f2c61: A subscription's row no longer keeps `scheduledProduct`, `scheduledPrice` and `scheduledAt` once the
  scheduled phase has begun at Stripe: the next phase is read after the one Stripe says is current,
  in Stripe's time, which a test clock moves, rather than by the server's clock.
- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [458361b]
- Updated dependencies [4c9e506]
- Updated dependencies [20aec1b]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [81f66fb]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0
  - @ultimabase/http@0.8.0
  - @ultimabase/jobs@0.8.0

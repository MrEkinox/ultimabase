# @ultimabase/stripe

## 1.1.0

### Minor Changes

- 4d785e2: `stripe.portal({ payer, open: 'change' })` without `product` and `price` opens Stripe's plan picker on the payer's subscription (D-403).

### Patch Changes

- 3d771bd: `stripePlugin`, `applyStripeCatalog` and `stripeSandbox` take a Stripe restricted key, `rk_live_…`
  or `rk_test_…`, as well as a secret key (D-406). Any other value, as a publishable key, is refused
  at start, and the documentation lists the permissions a restricted key needs.
- 747e5d3: The sandbox's helpers are typed as functions that need no `this`, so a suite
  can destructure them (`export const { deliver, cleanup } = sandbox`) without
  the type-aware `unbound-method` lint rule flagging each one. `customerOf` also
  finds the customers `payer` made, which Stripe leaves out of its customer list
  because they sit on a test clock.
- Updated dependencies [4357de4]
- Updated dependencies [44fd95d]
  - @ultimabase/http@1.1.0
  - ultimabase@1.1.0
  - @ultimabase/testing@1.1.0
  - @ultimabase/jobs@1.1.0

## 1.0.0

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
- a7127c3: `@ultimabase/stripe/sandbox` runs an application's tests against a Stripe sandbox (D-401): `stripeSandbox({ secret, webhook })` gives payers customers on test clocks, moves those clocks with `advance`, posts the run's customers' events to the webhook with `deliver`, checks the catalog with `expectCatalog`, and deletes what the run made with `cleanup`.
- e289391: `stripe.checkout`'s `terms.acceptance` takes texts by locale, such as
  `{ default: '…', fr: '…', 'pt-BR': '…' }`: the Checkout page's language picks one, then its language
  part, then `default` (D-390). A key that is not a canonical locale is refused.

### Patch Changes

- 4b2278d: `stripePlugin`, its `keys` and `applyStripeCatalog` refuse an option misspelt `key` without quoting
  its value, which may be a secret key: `stripePlugin takes no key.`
- 01f2c61: A subscription's row no longer keeps `scheduledProduct`, `scheduledPrice` and `scheduledAt` once the
  scheduled phase has begun at Stripe: the next phase is read after the one Stripe says is current,
  in Stripe's time, which a test clock moves, rather than by the server's clock.
- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [4b2278d]
- Updated dependencies [458361b]
- Updated dependencies [4c9e506]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [20aec1b]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [51f8f04]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [3099475]
- Updated dependencies [fd85be5]
- Updated dependencies [81f66fb]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
- Updated dependencies [1520a09]
- Updated dependencies [4b2278d]
- Updated dependencies [4b2278d]
  - ultimabase@1.0.0
  - @ultimabase/http@1.0.0
  - @ultimabase/jobs@1.0.0
  - @ultimabase/testing@1.0.0

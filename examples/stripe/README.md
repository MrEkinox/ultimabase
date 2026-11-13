# Stripe

A catalog declared in code (`defineProduct`, `defineCredit`), written to
Stripe by the application's deploy script (`applyStripeCatalog`), and sold
by `stripePlugin`: Checkout, the customer portal, the webhook and credits.

- `src/catalog.ts`: a subscription with three prices, and gems paid once.
- `src/stripe.ts`: what the application sells with, and the deploy call.
- `src/deploy.ts`: the deploy script.
- `src/models.ts`: the users and the three billing models.
- `src/app.ts`: the application, with `stripePlugin`.
- `src/shop.ts`: Checkout, the success page, the portal and spending gems.
- `src/app.test.ts`: all of it on Stripe accounts in memory.

`STRIPE_SECRET_KEY=sk_test_… yarn deploy --dry-run` prints the plan for a
Stripe sandbox; `STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_…
yarn start` serves the application; `yarn vitest examples/stripe` runs its
tests.

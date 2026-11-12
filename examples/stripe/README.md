# Stripe

A catalog declared in code (`defineProduct`, `defineCredit`) and written to
Stripe by the application's deploy script (`applyStripeCatalog`).

- `src/catalog.ts`: a subscription with three prices, and gems paid once.
- `src/stripe.ts`: the call that brings Stripe to them.
- `src/deploy.ts`: the deploy script.
- `src/app.test.ts`: the catalog on a Stripe account in memory.

`STRIPE_SECRET_KEY=sk_test_… yarn deploy --dry-run` prints the plan for a
Stripe sandbox; `yarn vitest examples/stripe` runs its tests.

# @ultimabase/stripe

Stripe for UltimaBase. The application declares what it sells in code, subscriptions, products paid once and the credits they give, and its deploy script brings the Stripe account and its customer portal to that catalog, printing the plan first. `stripePlugin` sells it on Stripe's Checkout and customer portal, and Stripe's events keep the application's subscriptions, purchases and credit balances in step; an hourly job reads Stripe's events to catch one the webhook missed. `stripe.spend` spends the credits.

In this repository, `yarn test:stripe` runs the package against a Stripe sandbox, given `STRIPE_SECRET_KEY=sk_test_…`; CI does not run it.

Documentation: [Stripe](https://ultimabase.dev/docs/stripe).

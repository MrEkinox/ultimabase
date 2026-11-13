# @ultimabase/stripe

Stripe for UltimaBase. The application declares what it sells in code, subscriptions, products paid once and the credits they give, and its deploy script brings the Stripe account and its customer portal to that catalog, printing the plan first. `stripePlugin` sells it on Stripe's Checkout and customer portal, and Stripe's events keep the application's subscriptions, purchases and credit balances in step; `stripe.spend` spends the credits.

Documentation: [Stripe](https://ultimabase.dev/docs/stripe).

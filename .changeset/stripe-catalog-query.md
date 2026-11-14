---
'@ultimabase/stripe': minor
---

`stripePlugin({ catalog: true })` adds the public query `stripeCatalog`, in GraphQL and at
`GET /api/functions/stripeCatalog`: the subscriptions with their prices, and the one-time
purchases, in their declared order, with their amounts, intervals, trials and credits. It is
served from the code, without calling Stripe, and typed by the billing models' enums.
`stripe.catalog()` returns the same value on the server.

---
'@ultimabase/stripe': minor
---

`@ultimabase/stripe/sandbox` runs an application's tests against a Stripe sandbox (D-401): `stripeSandbox({ secret, webhook })` gives payers customers on test clocks, moves those clocks with `advance`, posts the run's customers' events to the webhook with `deliver`, checks the catalog with `expectCatalog`, and deletes what the run made with `cleanup`.

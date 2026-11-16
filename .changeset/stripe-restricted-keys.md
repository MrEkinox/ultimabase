---
'@ultimabase/stripe': patch
---

`stripePlugin`, `applyStripeCatalog` and `stripeSandbox` take a Stripe restricted key, `rk_live_…`
or `rk_test_…`, as well as a secret key (D-406). Any other value, as a publishable key, is refused
at start, and the documentation lists the permissions a restricted key needs.

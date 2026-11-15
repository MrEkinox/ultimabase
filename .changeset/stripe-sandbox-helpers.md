---
'@ultimabase/stripe': patch
---

The sandbox's helpers are typed as functions that need no `this`, so a suite
can destructure them (`export const { deliver, cleanup } = sandbox`) without
the type-aware `unbound-method` lint rule flagging each one. `customerOf` also
finds the customers `payer` made, which Stripe leaves out of its customer list
because they sit on a test clock.

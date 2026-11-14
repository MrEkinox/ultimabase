---
'@ultimabase/stripe': minor
---

`stripe.portal({ payer, paymentMethod: {} })` opens the customer portal on the form that changes the
payer's payment method, and returns to `returnUrl` once done (D-389). `stripe.portal` takes at most
one of `change`, `cancel` and `paymentMethod`.

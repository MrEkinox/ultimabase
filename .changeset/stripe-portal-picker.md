---
'@ultimabase/stripe': minor
---

`stripe.portal({ payer, open: 'change' })` without `product` and `price` opens Stripe's plan picker on the payer's subscription (D-403).

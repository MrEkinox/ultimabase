---
'@ultimabase/stripe': minor
---

`stripe.portal` names the page it opens with `open`, one at a time (D-394), and opens a new one:
`open: 'paymentMethod'`, the form that changes the payer's payment method, which returns to
`returnUrl` once done (D-389).

Breaking: `change` and `cancel` give way to `open`.

```ts
// Before
stripe.portal({ payer, change: { product: pro, price: 'yearly' } })
stripe.portal({ payer, cancel: { subscription } })
// After
stripe.portal({ payer, open: 'change', product: pro, price: 'yearly' })
stripe.portal({ payer, open: 'cancel', subscription })
```

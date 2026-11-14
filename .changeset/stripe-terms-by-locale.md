---
'@ultimabase/stripe': minor
---

`stripe.checkout`'s `terms.acceptance` takes texts by locale, such as
`{ default: '…', fr: '…', 'pt-BR': '…' }`: the Checkout page's language picks one, then its language
part, then `default` (D-390). A key that is not a canonical locale is refused.

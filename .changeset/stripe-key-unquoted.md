---
'@ultimabase/stripe': patch
---

`stripePlugin`, its `keys` and `applyStripeCatalog` refuse an option misspelt `key` without quoting
its value, which may be a secret key: `stripePlugin takes no key.`

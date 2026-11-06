---
'ultimabase': patch
---

In `beforeCreate`, a field with a default is no longer `undefined` in the type of `data`: the hook runs after the defaults, so `data.status ?? 'inProgress'` can become `data.status`. A function default that may return `undefined` keeps its field possibly `undefined`, and so does a list without a default.

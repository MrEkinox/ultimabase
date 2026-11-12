---
'ultimabase': patch
'@ultimabase/roles': patch
---

`defineModel`, `defineUser`, `defineRole` and `defineFunction` refuse a key they do not take, as
`hooks` or `access` given to the definition instead of `.with()`, which was dropped unread (D-370).

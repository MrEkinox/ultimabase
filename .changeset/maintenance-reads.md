---
'@ultimabase/maintenance': patch
---

A server no longer stays in maintenance when the read of an earlier switch
answers after the read of a later one: a read or write that ends after a
later one has no effect. A `GET` or any method but `PUT` on
`/_ultimabase/maintenance` meets the 503 during the maintenance, as every
other request. `retryAfter` must be a positive number of milliseconds: `NaN`,
`0`, a negative number or `Infinity` refuses the start (D-222).

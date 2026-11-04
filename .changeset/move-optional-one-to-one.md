---
'ultimabase': minor
'@ultimabase/testing': minor
---

An optional one-to-one moves from the side without the key (D-239). When the
side that stores the key is optional, `connect`, `create` and `disconnect`
from the other side leave the old row with no key instead of failing with
`… cannot be left without one.` From the side that stores the key, connecting
a row another row holds stays a `UNIQUE_VIOLATION`.

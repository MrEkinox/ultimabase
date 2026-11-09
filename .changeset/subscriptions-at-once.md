---
'@ultimabase/realtime': patch
---

A connection that opens several live reads at once holds no more than
`maxSubscriptions`: each is counted again once planned.

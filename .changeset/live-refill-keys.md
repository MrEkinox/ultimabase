---
'@ultimabase/realtime': patch
'ultimabase': patch
---

A live list no longer stays wrong for good after concurrent writes, with rows missing or out of order or `hasMore` false: it refills from the sort keys it holds, not from where its last row has moved to.

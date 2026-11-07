---
'@ultimabase/realtime': patch
---

A live list no longer drops a row it may read when a write made it readable during a flush, and no longer reads the whole list again for it.

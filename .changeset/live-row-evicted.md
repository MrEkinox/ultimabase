---
'@ultimabase/live': patch
---

The Apollo link evicts a live row from the cache once it turns null, deleted or unreadable, as it
already did for a live list's gone rows.

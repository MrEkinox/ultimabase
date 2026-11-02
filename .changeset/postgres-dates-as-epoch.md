---
'@ultimabase/postgres': patch
'@ultimabase/testing': patch
---

A read returns its dates as milliseconds since the epoch and decodes its rows in place, without copying them: 10 000 subscriptions to lists of 1000 rows open in 40 s instead of 52. A date stored with microseconds by another writer rounds down to its millisecond, before 1970 too.

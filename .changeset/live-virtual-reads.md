---
'@ultimabase/realtime': minor
'ultimabase': patch
---

A live row or list that selects a virtual field follows what its `run` or `runMany` read: a write to one of those rows sends again, with their new value, only the rows whose value changed (D-187).

---
'@ultimabase/maintenance': patch
---

`lock()` and `unlock()` leave the server in the state they stored, even when a read of the state began while they wrote it.

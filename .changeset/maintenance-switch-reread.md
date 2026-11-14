---
'@ultimabase/maintenance': patch
---

`lock()` and `unlock()` read the state back once stored. A server whose switch was answered after
another server's later switch now follows the later one, instead of staying locked, or unlocked,
against the stored state.

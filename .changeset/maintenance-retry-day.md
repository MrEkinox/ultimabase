---
'@ultimabase/maintenance': patch
---

The maintenance's `retryAfter` is a day at most: a longer one refuses the
start, as a client told to wait longer would not come back.

---
'@ultimabase/password': patch
---

The sign-in failures are indexed by address and time, so the ceiling from one address reads an index instead of the whole table. The application needs a migration for the new index: run `ultimabase migrate create`.

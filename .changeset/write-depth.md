---
'ultimabase': patch
'@ultimabase/rest': patch
---

A write nested more than 32 levels deep is refused with `INVALID_QUERY` at its 33rd level, for every caller, instead of running out of stack over REST and GraphQL (D-350).

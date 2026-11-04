---
'ultimabase': patch
'@ultimabase/rest': patch
'@ultimabase/graphql': patch
---

A filter nests at most 32 levels: deeper, it answers `BAD_USER_INPUT` instead of running out of stack with `INTERNAL` (D-228).

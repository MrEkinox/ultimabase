---
'@ultimabase/postgres': patch
---

`migrate create` writes a note below a statement that makes code still running without a new field fail to insert during a rolling deploy: the `set not null` of a required field without a fixed default, and the size check whose minimum refuses the empty list a new column keeps. The note says to make that change in a later deploy.

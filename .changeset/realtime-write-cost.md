---
'@ultimabase/realtime': patch
'@ultimabase/graphql': patch
'@ultimabase/postgres': patch
---

A write costs its readers: it visits only the reads it can concern, and runs fewer statements. Subscribers of one row share its execution, a document is validated once, and a message is compressed only above 2 KB.

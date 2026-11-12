---
'@ultimabase/jobs': minor
---

`defineJob({ key })` runs one run of each key at a time: while a run of the key waits, `enqueue` adds none, and a run enqueued while one runs starts once it ends, on any server (D-365).

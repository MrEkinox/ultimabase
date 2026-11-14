---
'@ultimabase/jobs': patch
---

A keyed `enqueue` that joins a waiting run no longer lets another instance run it before the enqueue
commits, and no longer drops its run when the waiting one was claimed meanwhile: a new run waits.

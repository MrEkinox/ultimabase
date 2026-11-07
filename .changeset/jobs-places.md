---
'@ultimabase/jobs': patch
---

An instance runs at most 20 runs at once, so 2000 runs enqueued together no longer take every database connection: a read made meanwhile takes 3 ms instead of 430 ms. A slow run no longer holds back the 19 others of its batch, so 1000 due rows with 20 slow ones run in 2.3 s instead of 10.4 s. `runJobs()` now fails when a run fails outside its job, as when the database is down, instead of passing with nothing run.

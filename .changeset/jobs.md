---
'@ultimabase/jobs': minor
'@ultimabase/testing': minor
---

New package, `@ultimabase/jobs`: `defineJob({ name, input, run })` gives a
job whose `enqueue(input, { after })` writes a run in the current
transaction, so it exists if and only if the write commits; a job with
`every` or `cron` and `timeZone` runs on its schedule. `jobsPlugin({ jobs })`
runs them on every server, each run on one through a five-minute lease,
retried 10 s later, then twice as long each time, up to ten attempts; a run
runs at least once, its `id` the idempotency key. `runJobs()`, from
`@ultimabase/testing`, runs during a test the runs due now and those they
enqueue (D-221).

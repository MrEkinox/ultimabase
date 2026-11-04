# @ultimabase/jobs

## 0.4.0

### Minor Changes

- b087ae6: New package, `@ultimabase/jobs`: `defineJob({ name, input, run })` gives a
  job whose `enqueue(input, { after })` writes a run in the current
  transaction, so it exists if and only if the write commits; a job with
  `every` or `cron` and `timeZone` runs on its schedule. `jobsPlugin({ jobs })`
  runs them on every server, each run on one through a five-minute lease,
  retried 10 s later, then twice as long each time, up to ten attempts; a run
  runs at least once, its `id` the idempotency key. `runJobs()`, from
  `@ultimabase/testing`, runs during a test the runs due now and those they
  enqueue (D-221).

### Patch Changes

- Updated dependencies [67d5152]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4e1a966]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
- Updated dependencies [b5c22b0]
- Updated dependencies [1d7fda8]
- Updated dependencies [a778695]
- Updated dependencies [adafb1a]
- Updated dependencies [2afc370]
- Updated dependencies [e61e1c2]
- Updated dependencies [844627a]
- Updated dependencies [eb6dbbf]
- Updated dependencies [c9a8228]
- Updated dependencies [501c0cb]
- Updated dependencies [644a24f]
- Updated dependencies [efc4303]
- Updated dependencies [6c1cfe5]
  - ultimabase@0.4.0

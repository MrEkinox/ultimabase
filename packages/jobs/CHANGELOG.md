# @ultimabase/jobs

## 0.8.0

### Minor Changes

- 20aec1b: The application's code logs with the application's logger, its lines named `app` (D-364): a function's `run` receives `logger`, bound to `{ function: name }`; each hook receives `logger`; a route reads `c.var.logger`; a job's `run` receives `logger`, bound to `{ job: name, run: id }`.
- 20aec1b: `defineJob({ key })` runs one run of each key at a time: while a run of the key waits, `enqueue` adds none, and a run enqueued while one runs starts once it ends, on any server (D-365).
- 81f66fb: A plugin adds its own jobs from its `api`, with `plugins.jobs.add(jobs)` (D-369): the application lists the plugin, not its jobs. Two jobs of one name, the application's or a plugin's, fail the start with `Two jobs are named <name>.`

### Patch Changes

- 1520a09: The kernel publishes each model operation, hook, virtual field and function on Node's tracing channels `ultimabase:operation`, `ultimabase:hook`, `ultimabase:virtual` and `ultimabase:function`, nested, and each error the server logs at error level on `ultimabase:error` with its correlation id. A tool such as an error tracker subscribes to them; without a subscriber, nothing is built.
- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0

## 0.7.0

### Patch Changes

- 1f34e7a: `every` and `after` are refused unless the run is due before the year 10000, and a cron pattern no date matches, as `0 0 30 2 *`, is refused at import: `closeRoom: cron "0 0 30 2 *" never runs.`
- 1f34e7a: Instances that start at once no longer fail on the rows of recurring jobs.
- 1f34e7a: `enqueue` stores an input holding a date or an undefined key as JSON, where it refused it.
- 1f34e7a: A run that outlives its five-minute lease no longer fails the instance that took it over: that instance ends it, and the first logs a warning.
- 1f34e7a: A run that fails with a message holding a NUL now counts its attempt, where it ran again for ever.
- 1f34e7a: A server no longer fails the runs of a job it does not declare, as a server of an older version during a deploy: it leaves them to the servers that declare the job. At start, a recurring job's row an older version turned `failed` is pending again.
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
  - ultimabase@0.7.0

## 0.6.0

### Patch Changes

- 1d0d3de: An instance runs at most 20 runs at once, so 2000 runs enqueued together no longer take every database connection: a read made meanwhile takes 3 ms instead of 430 ms. A slow run no longer holds back the 19 others of its batch, so 1000 due rows with 20 slow ones run in 2.3 s instead of 10.4 s. `runJobs()` now fails when a run fails outside its job, as when the database is down, instead of passing with nothing run.
- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [41b5dca]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [d6ec5d4]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0

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

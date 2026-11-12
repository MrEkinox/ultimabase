# Jobs

Calls whose video room closes in a job ten minutes after they end
(`jobsPlugin()`), a purge of the old calls every hour and a report each
night at 3:00 in Paris.

- `src/models.ts`: the call, whose update enqueues the job that closes its
  room, and the job that fetches a room, one run per room at a time (`key`).
- `src/app.ts`: the recurring jobs, and the application.
- `src/app.test.ts`: the jobs run as the servers would, on a clock the test
  moves (`runJobs()`).

`yarn start` serves it on http://localhost:3000; `yarn vitest examples/jobs`
runs its tests.

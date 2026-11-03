# @ultimabase/jobs

Jobs for UltimaBase. A run enqueued from a hook is written in the write's transaction, so it exists if and only if the write committed; it can wait a delay, or run on an `every` or `cron` schedule, and is retried until it succeeds.

Documentation: [Jobs](https://ultimabase.dev/docs/jobs).

---
'@ultimabase/jobs': minor
---

A plugin adds its own jobs from its `api`, with `plugins.jobs.add(jobs)` (D-369): the application lists the plugin, not its jobs. Two jobs of one name, the application's or a plugin's, fail the start with `Two jobs are named <name>.`

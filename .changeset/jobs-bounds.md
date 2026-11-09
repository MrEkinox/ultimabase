---
'@ultimabase/jobs': patch
---

`every` and `after` are refused unless the run is due before the year 10000, and a cron pattern no date matches, as `0 0 30 2 *`, is refused at import: `closeRoom: cron "0 0 30 2 *" never runs.`

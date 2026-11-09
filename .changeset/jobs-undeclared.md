---
'@ultimabase/jobs': patch
---

A server no longer fails the runs of a job it does not declare, as a server of an older version during a deploy: it leaves them to the servers that declare the job. At start, a recurring job's row an older version turned `failed` is pending again.

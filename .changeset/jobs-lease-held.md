---
'@ultimabase/jobs': patch
---

A run holds its lease while it runs, so a run longer than five minutes no longer starts again on another instance, and the plugin warns every five minutes of a run still running. Each run that starts counts an attempt: a run that stops its instance ten times in a row turns `failed` instead of running again for ever. An instance that stops waits ten seconds at most for its runs, then warns with the ids of those left, which another instance runs again once their lease ends.

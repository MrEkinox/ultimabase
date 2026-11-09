---
'@ultimabase/jobs': patch
---

A run that outlives its five-minute lease no longer fails the instance that took it over: that instance ends it, and the first logs a warning.

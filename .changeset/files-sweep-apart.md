---
'@ultimabase/files': patch
---

A slow storage no longer holds the application's start: the sweep at startup runs without being
awaited. One sweep runs at a time, and the stop waits for the one under way, so no sweep runs
after the stop.

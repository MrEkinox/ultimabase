---
'@ultimabase/realtime': patch
---

The `refresh` of live callers no longer holds every live read while all callers are built again. Each caller is built again `refresh` after it connected, then every `refresh`, and the callers due are built 32 at a time, with the writes' messages in between. With 10 000 connected callers, every live read stopped for about 10 s every 5 minutes.

---
'@ultimabase/postgres': patch
---

The change feed calls `lost` as soon as its listener loses its connection, before `missed` once it listens again.

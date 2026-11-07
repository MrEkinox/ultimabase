---
'@ultimabase/realtime': patch
---

A write no longer visits every live read of a model when those reads filter on a text field: with 10 000 such reads, a write is told in 11 ms instead of 70 ms.

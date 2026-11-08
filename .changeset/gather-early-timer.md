---
'@ultimabase/realtime': patch
---

Two flushes of live changes stay at least 50 ms apart even on a busy server, whose timers could ring a few milliseconds early and split changes the gather should have sent together.

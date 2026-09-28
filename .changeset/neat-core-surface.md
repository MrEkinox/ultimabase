---
'@ultimabase/core': minor
---

Remove the direct capability-inventory constructor and aggregate asynchronous
context exports from Core's root. Capability inspection remains available via
`PluginGraph.capabilities`, while focused contextual access remains available
through `getCurrentUltimaBase()`, `getCurrentEngine()`, and
`getCurrentRequest()`.

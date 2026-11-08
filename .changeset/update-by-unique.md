---
'ultimabase': patch
---

An update by a unique field other than `id`, such as `slug`, and the update branch of an `upsert` load no row when nothing needs it: one round trip instead of four, 60 % less time. An `upsert` that creates takes two round trips instead of four.

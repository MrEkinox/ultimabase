---
'ultimabase': patch
---

A user's `update`, `delete` or `upsert` by a unique field, under rules that do not read `record`, no longer reads the row first: the rules' filters are checked in the write's own statement, one round trip instead of five, 70 % faster on PostgreSQL. A rule that reads `record` still gets the row, and the errors do not change. An update that sets none of the fields its rule's filter reads skips the count after the write.

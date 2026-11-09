---
'ultimabase': patch
---

A `connectOrCreate`'s `where` on a field the caller may not read is refused with `INVALID_QUERY`, as
a find's is: it no longer tells who holds a value the caller cannot see.

---
'ultimabase': minor
'@ultimabase/postgres': patch
---

A `one` view whose filter is only `{ user: { viewer: false } }` reads the
other row of a pair: a member reads the other member, anyone else `null`.
Its `many` takes `size: { max: 2 }` and the target a unique index on the key
and the relation. A `one` view that finds two rows fails the read (D-249).

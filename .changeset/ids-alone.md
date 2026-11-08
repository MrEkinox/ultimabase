---
'@ultimabase/postgres': patch
---

An include that selects the `id` of a `one` relation, or of a `many` through a join, alone reads the foreign keys instead of the target's rows, outside a transaction and when no read rule or trash filters the target: a list of 100 rows with its authors' and tags' ids reads about 20 % faster.

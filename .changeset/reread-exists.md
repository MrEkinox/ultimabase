---
'@ultimabase/graphql': patch
---

A function whose output is a model re-reads the `f.exists` fields its query
selects, as it does its relations: `follow(…) { id isFollowed }` no longer
fails with an internal error.

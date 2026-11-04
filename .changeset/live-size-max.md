---
'ultimabase': minor
'@ultimabase/realtime': patch
---

A live list counts a nested `many` at the smaller of its `take` and its
`size.max`: `images(first: 100)` on a `size: { max: 10 }` relation counts 10
rows toward `maxLive`, not 100. A model's `ExposedModel` lists its bounded
relations as `sizes`.

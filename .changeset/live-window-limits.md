---
'@ultimabase/graphql': patch
'@ultimabase/rest': patch
'@ultimabase/realtime': minor
'@ultimabase/live': minor
---

A live list's `first` is bounded by `maxLive` only, over GraphQL and REST; `maxTake` bounds page mode. A refusal past `maxLive` carries `details: { limit, rows }`, which `LiveError.details` exposes, and a `fetchMore` refused past it rejects while the list goes on following its window as it was (D-186).

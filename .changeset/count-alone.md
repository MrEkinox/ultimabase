---
'@ultimabase/http': patch
'@ultimabase/graphql': patch
'@ultimabase/rest': patch
'@ultimabase/realtime': patch
---

A connection asking for its `totalCount` alone reads no row: over GraphQL
when neither `edges` nor `pageInfo` is selected, or with `first: 0`; over
REST and live with `first=0&totalCount=true` (D-226).

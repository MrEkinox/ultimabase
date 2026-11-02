---
'@ultimabase/graphql': patch
'@ultimabase/rest': patch
---

A function's returned row keeps the virtual fields `run` returned, over GraphQL and REST as from server code; only the ones it left out are computed (D-109).

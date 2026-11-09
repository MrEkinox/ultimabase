---
'@ultimabase/graphql': patch
---

A subscription whose variables are nested deeper than the stack is refused with `The variables are nested too deep.` (`BAD_USER_INPUT`), as the same query over HTTP. It failed with `Internal error.` and logged a `RangeError`.

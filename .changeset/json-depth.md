---
'ultimabase': patch
---

A json value nested more than 1000 levels deep is refused with a 400, in a write or a filter, instead of running out of stack with a 500 (D-330).

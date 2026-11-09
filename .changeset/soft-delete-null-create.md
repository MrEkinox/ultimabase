---
'@ultimabase/soft-delete': patch
---

A caller may create a row with `deletedAt: null`, as it may update one: only a date is refused.

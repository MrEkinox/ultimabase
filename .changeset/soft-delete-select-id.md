---
'@ultimabase/soft-delete': patch
---

A soft delete no longer computes the row's virtual fields twice: the update that marks the row deleted reads only its id, and the delete computes them once, for the row it returns.

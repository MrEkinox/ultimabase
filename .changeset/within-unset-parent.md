---
'ultimabase': patch
'@ultimabase/postgres': patch
---

A relation kept `within` a parent links no target while the row's parent is
unset: the write is refused with the relation's usual issue, and so is
emptying the parent while a target is linked. A delete that empties the
parent empties the target first. `postgres()` adds a `_within_check` beside
the `within` key when the parent is optional (D-235).

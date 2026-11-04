---
'ultimabase': minor
---

`within` needs no `many` of the parent (D-243): a `one` or a many-to-many kept within a parent starts when nothing names the target's `one` to it. A write that links a target whose parent it does not hold reads that parent by key first, in its transaction.

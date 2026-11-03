---
'ultimabase': minor
'@ultimabase/auth': patch
---

A model's `create`, `update`, `delete` or `write` rule may return
`where(filter, error?)`, as a read rule does (D-214). An update's row matches
the filter before and after the write, a delete's before, a create's after,
with the relations it connects or creates; a row outside it refuses the whole
write with the given `PublicError`, or `ACCESS_DENIED`. `isOwner` still tells
a read rule from a write rule now that both receive `where`.

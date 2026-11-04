---
'ultimabase': minor
'@ultimabase/postgres': minor
---

`f.many(() => Membership, { inverse: false })` declares a many-to-many on
one side only: its target gets no field, and no transport publishes one. It
reads, writes, filters, counts and sorts as any many-to-many, takes
`within`, and refuses `size`. `postgres()` names its join table after the
declared side, `task_assignees`. Live queries follow it (D-248).

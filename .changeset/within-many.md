---
'ultimabase': patch
'@ultimabase/postgres': patch
---

A many-to-many takes `within: 'project'` on one side: every row it links has
the row's `project`, and a write that links two rows of different projects,
from either side, or moves a linked row to another project, is refused with
`VALIDATION_FAILED` (D-236). `postgres()` stores each link's parent in the
join table, with a foreign key per side, `on update cascade`, checked at
commit; `migrate create` fills the column and adds the keys.

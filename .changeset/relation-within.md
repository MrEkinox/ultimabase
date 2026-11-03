---
'ultimabase': minor
'@ultimabase/postgres': minor
---

A `one` relation takes `within`, which keeps its target in the row's parent:
`within: 'project'` refuses a task whose milestone belongs to another project,
and `within: { project: 'id' }` a project featuring another project's
milestone (D-220). The write is refused with `VALIDATION_FAILED`, its issue on
the field it moved. `postgres()` keeps it too, with a composite foreign key
checked at commit.

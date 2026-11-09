---
'ultimabase': minor
'@ultimabase/postgres': minor
---

`migrate deploy` and `reset` show, under `Applied <file>.`, the rows each `insert`, `update`, `delete` or `merge` statement of the file changed, `0` included:

```text
Applied 20261108_orphans.sql.
  delete from "auth_session" as "row" where not exists (select from "user" where "…: DELETE 0
```

An adapter's `migrations.apply(run, counted?)` takes a second parameter: `counted` hears `{ at, statement, command, rows }` for each such statement once its file is committed. An adapter that does not call it keeps working, and its deploys print no counts.

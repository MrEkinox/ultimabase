-- ultimabase schema 2fd2b10f400fc79147980938759b63aa232ffc47d63c95701d415c339b13725c
-- ultimabase no transaction

-- Built without locking the table against writes.
create index concurrently "task_open_idx" on "task" ("project_id") where not "done";

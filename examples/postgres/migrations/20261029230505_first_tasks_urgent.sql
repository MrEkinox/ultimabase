-- ultimabase schema 2fd2b10f400fc79147980938759b63aa232ffc47d63c95701d415c339b13725c

-- The tasks written before priorities came first.
update "task" set "priority" = 1 where not "done";

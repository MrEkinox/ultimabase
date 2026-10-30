-- ultimabase schema 2fd2b10f400fc79147980938759b63aa232ffc47d63c95701d415c339b13725c

alter table "task" add column "priority" integer not null default 0;

alter table "task" alter column "priority" drop default;

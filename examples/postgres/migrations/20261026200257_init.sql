-- ultimabase schema 990610f358e95c3ac4ddd347cf1b1cf920180443bd3cba10342742cbd61bc2f5

create table "project" (
	"id" uuid not null,
	"created_at" timestamptz not null,
	"updated_at" timestamptz not null,
	"name" text collate "C" not null,
	constraint "project_pkey" primary key ("id"),
	constraint "project_name_key" unique ("name")
);

create table "task" (
	"id" uuid not null,
	"created_at" timestamptz not null,
	"updated_at" timestamptz not null,
	"title" text collate "C" not null,
	"done" boolean not null,
	"project_id" uuid not null,
	constraint "task_pkey" primary key ("id")
);

create index "task_project_id_idx" on "task" ("project_id");

alter table "task" add constraint "task_project_id_fkey" foreign key ("project_id") references "project" ("id") deferrable initially deferred;

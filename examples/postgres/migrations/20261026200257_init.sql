-- ultimabase schema 02c76b0ac9336f14d52ff9b2aae48581258a9fa021864483d1b7b5d8cf686d89

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

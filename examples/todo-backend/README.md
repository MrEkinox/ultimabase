# Todo backend

A minimal backend-only UltimaBase application with one `Todo` schema,
PostgreSQL persistence, automatic generated types, and typed CRUD helpers.

## Start it

Build the repository packages once, provide a development PostgreSQL database,
then start the example from the repository root:

```sh
yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_todo \
	yarn workspace @ultimabase/example-todo-backend start
```

`await ultimabase.start()` compiles the static schema and atomically regenerates
[`.ultimabase/schema.generated.d.ts`](.ultimabase/schema.generated.d.ts) before
PostgreSQL connects. The future CLI will expose the same complete generation as
an explicit manual command; this example does not call the generator itself.

The generated declaration is included by this example's `tsconfig.json`, so it
provides exact completion for `Todo` models, create/update data, filters,
selections, Access, hooks, objects, and enum values. After startup, verify the
application source against that declaration with:

```sh
yarn workspace @ultimabase/example-todo-backend typecheck
```

The declaration deliberately reads like an application type file: concrete
types such as `TodoItem`, `TodoCreateInput`, `TodoWhereInput`, and
`TodoPriority` come first, followed by the flat `Schemas` registry.
Framework-only contracts are isolated at the bottom. The CRUD helper
imports `TodoCreateInput` directly, so the example cannot drift from its schema.

The PostgreSQL `override` schema policy is intentionally convenient for this
development example and should not be copied into a production migration
strategy.

## Backend operations

[`src/todos.ts`](src/todos.ts) exposes four ordinary typed functions:

- `createTodo(data)`
- `listPendingTodos()`
- `completeTodo(id)`
- `deleteTodo(id)`

They use only the schema-owned public Query and mutation APIs; application code
never imports PostgreSQL or Drizzle query builders.

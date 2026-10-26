# PostgreSQL

An application on `postgres()` and the path its tables take (D-105): in
development a start syncs them to the models; a change is written as a
migration file, committed in `migrations/` with `schema.json`; in production
`migrate deploy` applies the files, and a start checks that they match the
models.

- `src/models.ts`: the `Project` and `Task` models.
- `src/app.ts`: the application, on `DATABASE_URL`.
- `ultimabase.config.ts`: what the `ultimabase` commands run.
- `migrations/`: the first migration, which creates both tables.
- `src/app.postgres.test.ts`: a deploy then a production start, on a schema
  of its own.

With `DATABASE_URL` set, `yarn dev` serves it on
http://localhost:3000/graphql and syncs the tables on each change. After a
change to the models, `yarn ultimabase migrate create <name>` writes its
migration; `yarn ultimabase migrate deploy` applies the pending ones, then
`NODE_ENV=production yarn start` serves them. `yarn test:postgres` runs its
test.

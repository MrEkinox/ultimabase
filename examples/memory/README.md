# memory()

The in-memory database (D-02): what it keeps, and what it shares with
PostgreSQL.

- `src/models.ts`: the `Contact` model, its name searched and its email
  unique.
- `src/app.ts`: the application, on `memory()`.
- `src/app.test.ts`: a failed write that changes nothing, strings in
  PostgreSQL's "C" order, and the words `_search` reads.

`yarn start` serves it on http://localhost:3000/graphql, on a database that
starts empty each time. `yarn test` runs its tests.

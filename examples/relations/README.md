# Relations

Relations declared on both sides (D-37): an author's books (one-to-many), a
book's tags (many-to-many through a join table), nested creation in one
write, and what deleting a target does: an author's books are deleted with the author
(`onDelete: 'cascade'`), a publisher with books stays (a required relation
restricts by default).

- `src/models.ts`: the `Author`, `Publisher`, `Tag` and `Book` models.
- `src/app.ts`: the application.
- `src/app.test.ts`: each relation, written and read over GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/relations` runs its tests.

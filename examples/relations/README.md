# Relations

Relations declared on both sides (D-37), shown on the documentation's
Relations page: an author's books (one-to-many), a book's tags (many-to-many
through a join table), nested writes, reads and filters through relations,
and what deleting a target does: an author's books are deleted with the
author (`onDelete: 'cascade'`), a publisher with books stays (a required
relation restricts by default).

- `src/models.ts`: the `Author`, `Publisher`, `Tag` and `Book` models.
- `src/shapes.ts`: the other shapes, used from server code only: a
  one-to-one, a model related to itself, two relations between the same
  models, a join model and a view.
- `src/app.ts`: the application.
- `src/app.test.ts`: the relations written and read over GraphQL.
- `src/queries.test.ts`: every nested write, read and filter from server
  code.
- `src/shapes.test.ts`: the other shapes, written and read.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/relations` runs its tests.

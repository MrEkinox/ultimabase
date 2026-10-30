# Functions

A lending library, shown on the documentation's Functions page: functions
with an input, an output and an access rule, called from server code, over
GraphQL and over REST.

- `src/models.ts`: the `Book` model, read-only for clients.
- `src/functions.ts`: `borrowBook`, `searchBooks` and `returnBooks`, and the
  `Loan` type.
- `src/app.ts`: the application.
- `src/app.test.ts`: the functions run from server code and called over each
  transport.

`yarn start` serves it on http://localhost:3000/graphql and
http://localhost:3000/api; `yarn vitest examples/functions/` runs its tests.

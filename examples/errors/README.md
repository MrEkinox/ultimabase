# Errors

A shop's orders, shown on the documentation's Errors page: a `PublicError`
reaches the client with its code, message and details; any other error is
masked as `INTERNAL` and logged with a correlation id.

- `src/models.ts`: the `Product` model.
- `src/functions.ts`: `order`, which refuses with `OUT_OF_STOCK`, and
  `subscribe`, which fails without its configuration.
- `src/app.ts`: the application.
- `src/app.test.ts`: the errors from server code, REST and GraphQL.

`yarn start` serves it on http://localhost:3000; `yarn vitest
examples/errors` runs its tests.

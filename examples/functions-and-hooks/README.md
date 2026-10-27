# Functions and hooks

A function a client calls, `placeOrder`, which creates one order per line in
one `transaction`; an `afterCreate` hook on `Order` that decrements the
product's stock by the quantity; and a `beforeUpdate` hook on `Product` that
sees the stock the decrement leaves. When a line is out of stock, that hook
throws a `PublicError` and the whole order is rolled back.

- `src/models.ts`: the `Product` and `Order` models, and their hooks.
- `src/functions.ts`: the `placeOrder` function.
- `src/app.ts`: the application.
- `src/app.test.ts`: orders placed and refused over GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/functions-and-hooks` runs its tests.

# Functions and hooks

A function a client calls, `placeOrder`, which creates one order per line in
one `transaction`, and an `afterCreate` hook on `Order` that takes the
quantity from the product's stock. When a line is out of stock, the hook
throws a `PublicError` and the whole order is rolled back.

- `src/models.ts`: the `Product` and `Order` models, and the hook.
- `src/functions.ts`: the `placeOrder` function.
- `src/app.ts`: the application.
- `src/app.test.ts`: orders placed and refused over GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/functions-and-hooks` runs its tests.

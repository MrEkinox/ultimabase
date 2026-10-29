# Transactions

Bank transfers, shown on the documentation's Transactions page: two writes
in one `transaction`, rolled back by a thrown error, joined by an outer
transaction, and rolled back by a query that failed.

- `src/models.ts`: the `Account` model, read by its owner only.
- `src/functions.ts`: the `transfer` function.
- `src/app.ts`: the application.
- `src/app.test.ts`: the transfers that commit and those that roll back.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/transactions` runs its tests.

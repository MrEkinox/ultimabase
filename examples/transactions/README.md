# Transactions

Bank transfers, shown on the documentation's Transactions page: two writes
in one `transaction`, rolled back by a thrown error, joined by an outer
transaction, and rolled back by a query that failed. Likes between users,
matched in a serializable transaction.

- `src/models.ts`: the `Account` model, read by its owner only, and `Like`.
- `src/functions.ts`: the `transfer` and `like` functions.
- `src/app.ts`: the application.
- `src/app.test.ts`: the transfers that commit and those that roll back,
  and two likes that match.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/transactions` runs its tests.

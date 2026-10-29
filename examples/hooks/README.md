# Hooks

Support tickets, shown on the documentation's Hooks page: a `beforeFind` that
hides spam, `before*` hooks that change or refuse a write, an `afterUpdate`
that records activity in the same transaction, and an `afterUpdateCommit`
that sends a message once the transaction commits.

- `src/models.ts`: the `Ticket` model and its hooks, and its `Activity`.
- `src/outbox.ts`: the messages sent, standing for an email service.
- `src/app.ts`: the application.
- `src/app.test.ts`: each hook at work from server code, and a refusal over
  GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/hooks` runs its tests.

# A database adapter

An adapter that runs another (D-73): `timed()` counts its round trips and
logs the slow ones through the kernel's logger. The contract suite (D-94)
checks it as it checks every adapter.

- `src/timed.ts`: the adapter, around any other.
- `src/models.ts`: an `Author` and their `Post`s, each slug unique.
- `src/app.ts`: the application, on `timed(memory())`.
- `src/contract.test.ts`: `testAdapter`, the whole contract.
- `src/app.test.ts`: the round trips, and what a developer sees when the
  adapter refuses a write.
- `src/adapter.test.ts`: what the kernel sends an adapter, the errors it
  throws, the change feed and its limits, and the slow calls logged.

`yarn start` serves it on http://localhost:3000/api. `yarn vitest
examples/adapter` runs its tests.

# Testing

Notes read by their owner, shown on the documentation's Testing page:
`testApplication` starts the application around each test, on a new
in-memory database; `asUser` acts as a signed-in user.

- `src/models.ts`: the `Note` model.
- `src/app.ts`: the application.
- `src/app.test.ts`: the tests.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/testing` runs its tests.

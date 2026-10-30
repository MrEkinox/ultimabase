# Models and queries

A product catalog, shown on the documentation's Models and fields and
Queries pages: one field of each type, a shared enum (`defineEnum`), an
object type (`defineType`), indexes, a field only the server reads, and
virtual fields computed on read.

- `src/models.ts`: the `Product` model.
- `src/types.ts`: the `Status` enum and the `Price` type it uses.
- `src/app.ts`: the application.
- `src/app.test.ts`: a product created and read over GraphQL.
- `src/models.test.ts`: each field type written and read from server code,
  and the values a field refuses.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/models-and-queries` runs its tests.

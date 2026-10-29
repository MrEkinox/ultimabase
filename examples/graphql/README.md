# GraphQL

The GraphQL API `graphqlPlugin()` generates from the models and the
functions: Relay pages, unique reads, the four writes, the names a model or
a function sets, the limits a client meets, and a field added with
`extend`.

- `src/models.ts`: the `Person`, `Post` and `Revision` models.
- `src/functions.ts`: two functions, one renamed and one hidden.
- `src/schema.ts`: the fields `extend` adds.
- `src/app.ts`: the application.
- `src/app.test.ts`: the API used as a client would.
- `src/list.ts` and `src/list.test.ts`: the same models with
  `pagination: 'list'`.

`yarn start` serves it on http://localhost:3000/graphql, with GraphiQL in a
browser; `yarn vitest examples/graphql` runs its tests.

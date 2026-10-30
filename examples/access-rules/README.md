# Access rules

A newsroom's articles, shown on the documentation's Access rules page: a read
rule that filters the rows, write rules per operation, rules on single fields
and rules combined with `allOf`.

- `src/models.ts`: the `Article` model and its rules.
- `src/app.ts`: the application.
- `src/app.test.ts`: the rules at work for two signed-in users, for Master,
  and for an anonymous caller over GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/access-rules` runs its tests.

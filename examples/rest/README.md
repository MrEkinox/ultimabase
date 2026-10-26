# REST

One application served over REST (`restPlugin()`, under `/api`) and GraphQL
(`graphqlPlugin()`, under `/graphql`). REST takes GraphQL's arguments as
query parameters and answers with the JSON the matching GraphQL field
returns, so a client moves between them without a second vocabulary.

- `src/models.ts`: the `Author` and `Post` models.
- `src/app.ts`: the application.
- `src/app.test.ts`: the same rows written and read through both.

`yarn start` serves it on http://localhost:3000/api and
http://localhost:3000/graphql; `yarn vitest examples/rest` runs its tests.

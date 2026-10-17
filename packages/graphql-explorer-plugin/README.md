# @ultimabase/graphql-explorer-plugin

An optional GraphiQL or Apollo Sandbox page for the application's GraphQL HTTP
endpoint. It installs neither GraphQL, Yoga, HTTP nor a server.

## Installation

```sh
npm install @ultimabase/graphql-explorer-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. It requires a GraphQL HTTP endpoint
such as `@ultimabase/graphql-yoga-plugin`.

## Example

The explorer route answers, from the tested
[`examples/graphql`](../../examples/graphql/README.md) application:

<!-- region ../../examples/graphql/tests/notes.test.ts#notes-sandbox -->

```ts
const page = await t.fetch('/__ultimabase/apps/notes/apollo-sandbox')
```

<!-- endregion -->

## Documentation

- [GraphQL: choose a development explorer](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx#choose-a-development-explorer)

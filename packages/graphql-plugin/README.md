# @ultimabase/graphql-plugin

The official GraphQL schema and execution: generated types, queries and
mutations for the schemas an application exposes in `.with({ graphql: … })`,
public operations, and custom schemas. It serves no HTTP by itself.

## Installation

```sh
npm install @ultimabase/graphql-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. Generated fields need a database
plugin; serving over HTTP needs `@ultimabase/graphql-yoga-plugin`,
`@ultimabase/http-plugin` and a server provider, which `@ultimabase/api-server`
installs together.

## Example

Execute a query without HTTP, from the tested
[`examples/graphql`](../../examples/graphql/README.md) application:

<!-- region ../../examples/graphql/tests/schema.test.ts#execute -->

```ts
const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
// A request context of the started application, here anonymous.
const { context } = anonymous(ultimabase, {
	requestId: randomUUID(),
	source: 'internal',
})
const result = await graphql.execute({
	context,
	document: '{ findManyPost(first: 2) { nodes { title } } }',
})
```

<!-- endregion -->

## Documentation

- [GraphQL](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
- [Operations and GraphQL](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/operations-and-graphql.mdx)

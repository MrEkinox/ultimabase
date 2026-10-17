# @ultimabase/rest-plugin

The official REST transport: `/api/classes` routes for the schemas an
application exposes in `.with({ rest: … })`, public operations, and an OpenAPI
document.

## Installation

```sh
npm install @ultimabase/rest-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. A running API also needs
`@ultimabase/http-plugin`, a server provider such as
`@ultimabase/hono-server-plugin` and a database plugin; `@ultimabase/api-server`
installs the HTTP parts together.

## Example

Create a post over REST, from the tested
[`examples/rest`](../../examples/rest/README.md) application:

<!-- region ../../examples/rest/tests/writes.test.ts#create-post -->

```ts
const created = await t.fetch('/api/classes/Post?include=tags', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		title: 'Release notes',
		slug: 'release-notes',
		author: { connect: ada.id },
		tags: { connect: [news.id] },
	}),
})
```

<!-- endregion -->

## Documentation

- [REST](../../apps/website/content/docs/1.0.0/plugins/official/rest.mdx)
- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
- [Operations and GraphQL](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/operations-and-graphql.mdx#rest-and-http-are-separate-choices)

# Full-stack REST and GraphQL application

This runnable example combines every official plugin family in one
authenticated application: it starts a Hono listener on port `1337`, stores
data in PostgreSQL, and serves REST under `/api` and Yoga GraphQL on
`POST /graphql` over one HTTP application, with password sessions, roles,
ACLs, Hooks, Validation, both soft-delete modes, nested writes, virtual result
fields and contextual relation views. For a first run, start with the smaller
[modeling example](../modeling/README.md).

The project follows the [recommended layout](../../apps/website/content/docs/1.0.0/project-layout.mdx):
[`src/app.ts`](src/app.ts) installs the plugins the schemas are typed from,
[`src/schema.ts`](src/schema.ts) declares the schemas, and
[`src/ultimabase.ts`](src/ultimabase.ts) creates the application with a
function, `createUltimabase()`, because the repository's end-to-end suites
give each instance its own server, database and HTTP settings;
[`src/main.ts`](src/main.ts) creates and starts one.
[`src/client.ts`](src/client.ts) sends requests with the
`X-UltimaBase-Application-Id: full-stack` header.

## Run it

From the repository root, build the packages and supply a development database
plus a server-only Master key:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_full_stack \
ULTIMABASE_MASTER_KEY=development-only-secret \
  corepack yarn workspace @ultimabase/example-full-stack start
corepack yarn workspace @ultimabase/example-full-stack typecheck
```

The server listens at `http://127.0.0.1:1337` until `SIGINT` (Ctrl+C) or
`SIGTERM` stops it. `ULTIMABASE_MASTER_KEY` is the key of the HTTP Master
header, read once when the application starts. The repository's end-to-end
suites run this application.

## Documentation

- [Release Status](../../apps/website/content/docs/1.0.0/project/release-status.mdx) and
  [Using Plugins](../../apps/website/content/docs/1.0.0/plugins/using-plugins.mdx)
- [REST](../../apps/website/content/docs/1.0.0/plugins/official/rest.mdx),
  [GraphQL](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx),
  [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx) and
  [Hono Server](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx)
- [Password Authentication](../../apps/website/content/docs/1.0.0/plugins/official/password-authentication.mdx)
  and [Master Authority](../../apps/website/content/docs/1.0.0/core/security-foundations/master-authority.mdx)
- [Soft Delete](../../apps/website/content/docs/1.0.0/plugins/official/soft-delete.mdx),
  [Nested Writes](../../apps/website/content/docs/1.0.0/core/writing-data/nested-writes.mdx),
  [Virtual Fields](../../apps/website/content/docs/1.0.0/core/data-modeling/virtual-fields.mdx) and
  [Related Data](../../apps/website/content/docs/1.0.0/core/reading-data/related-data.mdx)

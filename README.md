# UltimaBase

UltimaBase is an open-source, Node.js-first backend framework for building typed data APIs from static TypeScript schemas.

It takes inspiration from the simplicity of Parse Server while deliberately replacing its limitations with stronger inference, explicit plugin boundaries, a single operation engine, immutable class-based builders, and first-class PostgreSQL support.

> Status: pre-release; no package is published on npm yet. See
> [the project history](ARCHITECTURE.md#history) and the [roadmap](ROADMAP.md).

## Intended developer experience

Configure plugins once, declare schemas from that factory, and register them
explicitly. This example uses a disposable development PostgreSQL database;
`override` may change its physical schema. The [full-stack application](examples/full-stack/README.md)
adds REST, GraphQL, authentication and policies to the same authoring path.

```ts twoslash
import { UltimaBase, toJSON } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

// postgresPlugin() reads DATABASE_URL when the application starts.
const Blog = UltimaBase.use(postgresPlugin()).use(softDeletePlugin())

// Each schema opts in to plugin behavior; nothing is registered automatically.
export const Post = Blog.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
	softDelete: { mode: 'command' },
})

export const AuditLog = Blog.Schema.define({
	className: 'AuditLog',
	fields: (field) => ({ message: field.string({ required: true }) }),
})

export const ultimabase = new Blog({ schemas: [Post, AuditLog] })

// One declaration per application gives name-keyed editor types.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}

// start() resolves to the application; leaving the scope disposes it.
await using started = await ultimabase.start()
const post = await Post.createOne({ data: { title: 'Hello UltimaBase' } })
await Post.softDeleteOne({ id: post.id })
const posts = await Post.findMany({
	where: { published: { eq: true } },
	take: 25,
})
// Results are frozen plain objects; toJSON serializes them as REST does.
console.log(toJSON(posts), started.state)
```

Types come from the declarations themselves, with no generation step.

## What it gives you

- **A small Core:** schemas, queries, one operation engine, transactions and
  audited Master authority. Everything else is a plugin, and Core never knows a
  plugin.
- **Official plugins:** PostgreSQL, REST, GraphQL, HTTP, Access, Hooks,
  Validation, ACL, Roles, Soft Delete and password authentication.
- **One pipeline for every caller:** server code, REST and GraphQL run the same
  rules, hooks and validation.

Read the [documentation](apps/website/content/docs/1.0.0/index.mdx): the
[quick start](apps/website/content/docs/1.0.0/quick-start.mdx), the
[comparison with Parse Server and others](apps/website/content/docs/1.0.0/comparison/overview.mdx)
and the [official plugins](apps/website/content/docs/1.0.0/plugins/overview.mdx).
The [full-stack example](examples/full-stack/README.md) combines REST, GraphQL,
authentication and policies.

## Repository map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): system boundaries, dependency graph,
  rebuilt module layout, and rebuild simplifications.
- [`docs/current-architecture.md`](docs/current-architecture.md): current
  contracts, responsible packages, and accepted decisions by concept.
- [`ROADMAP.md`](ROADMAP.md): proposed product directions.
- [`docs/`](docs/README.md): specifications, the architecture index, and ADRs.
- [`apps/website/content/docs`](apps/website/content/docs/1.0.0/index.mdx): the
  documentation website, the single source for user-facing behaviour.
- [`packages/`](packages/README.md): publishable `@ultimabase/*` packages.
- [`apps/`](apps/README.md): the documentation website.
- [`examples/`](examples/README.md): user-facing examples.
- [`tests/`](tests/README.md): cross-package integration and conformance tests.
- [`tooling/`](tooling/README.md): shared configuration, CI planning, and the
  editor-visible DX audit.

## Development setup

UltimaBase requires Node.js 24 and the Yarn version declared by `packageManager`.

```sh
corepack enable
yarn install --immutable
yarn build
yarn test
```

Built-export E2E suites and source tests that import another workspace package
read its built `dist` output, so run `yarn build` again after changing a package.

Corepack ensures that `yarn` uses the repository's pinned Yarn version instead of a globally installed Yarn Classic binary.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md) before making changes.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

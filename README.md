# UltimaBase

UltimaBase is an open-source, Node.js-first backend framework for building typed data APIs from static TypeScript schemas.

It takes inspiration from the simplicity of Parse Server while deliberately replacing its limitations with stronger inference, explicit plugin boundaries, a single operation engine, immutable class-based builders, and first-class PostgreSQL support.

> Status: pre-release; no package is published on npm yet. See
> [the project history](ARCHITECTURE.md#history) and the [roadmap](ROADMAP.md).

## Intended developer experience

Configure plugins once, declare schemas from that factory, and register them
explicitly. This example uses a disposable development PostgreSQL database;
`override` may change its physical schema. The [minimal application](examples/minimal/README.md)
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
await using app = await ultimabase.start()
const post = await Post.createOne({ data: { title: 'Hello UltimaBase' } })
await Post.softDeleteOne({ id: post.id })
const posts = await Post.findMany({
	where: { published: { eq: true } },
	take: 25,
})
// Results are frozen plain objects; toJSON serializes them as REST does.
console.log(toJSON(posts), app.state)
```

Every type infers from the declarations themselves, with no generation step
(ADR-0297): plugin fields, rules and commands come from the configured
factory, and relations name their target with a thunk (`() => Author`).
JavaScript executes the same graph.

## Principles

- Developer declarations plus authorized deterministic plugin contributions
  form the authoritative compiled application graph.
- Concrete product capabilities are plugins; Core is the trusted,
  privilege-aware application and execution kernel.
- Publishable plugin packages use the explicit `-plugin` directory and package-name suffix.
- Core contains Schema, Query, application orchestration, protected execution,
  persistence-plan, master-authority, and Runtime mechanisms while remaining
  independent from concrete product and infrastructure implementations.
- REST and GraphQL use one operation AST and one runtime pipeline.
- Singular creates and updates accept the same schema-aware nested pointer and
  relation commands through direct TypeScript, REST, and GraphQL. Core executes
  the complete bounded graph in one automatic transaction.
- Relations may declare one static or request-contextual `where` with
  `relations` in the schema's `.with` that shapes direct reads, eager
  inclusions, REST, and GraphQL consistently without replacing Access, ACL,
  protected constraints, or physical membership.
- UltimaBase, Schema, Query, ACL, and Role domain objects use immutable classes.
- Hooks, Access, and application field validation are optional official plugin
  capabilities. The Validation plugin owns Standard Schema rules while Core
  always retains structural validation. ACL contributes
  persisted per-object policies directly
  through Core's generic protected-policy boundary, while roles and
  authentication provide optional request subjects. Core keeps anonymous and
  trusted master authority; master bypasses authorization without bypassing
  structural or installed application validation, hooks, transactions, or
  integrity constraints.
- Types come from the declarations, without code generation; JavaScript
  applications run the same graph without a generated client.
- Stable plugin operations and application-specific schema surfaces execute
  through application-owned handles. Plugin schema mutations can also be
  called directly on a frozen configured schema class; the class resolves the
  sole active owner and dispatches through its compiled handle.
- The official soft-delete plugin turns a schema's native deletes into a
  tombstone (`softDelete: true` in `define`) or keeps them physical and adds the
  `softDeleteOne`/`softDeleteMany` commands (`softDelete: { mode: 'command' }`).
  Ordinary reads stay tombstone-blind; `restoreOne`/`restoreMany` are
  authorized by Access, while audited `purgeOne`/`purgeMany` remain private to
  trusted server code.
- Owner-private plugin records retain typed transactional persistence and
  versioned physical provenance without becoming application schemas, Query
  surfaces, generated transport routes, or application behavior inputs.
- PostgreSQL synchronization is available today. Migration support is not shipped;
  a future migration product would own reviewed DDL and history separately.
- An optional HTTP plugin delivers HTTP application identity,
  Fetch-compatible route composition, and request context resolution. Hono
  only provides the server, REST and GraphQL remain sibling transports, and
  authentication (`auth-plugin` with methods such as `auth-password`) adds
  identity without granting authorization.
- That target enters Runtime through a narrow Core request-execution capability
  rather than giving HTTP the application engine. Cross-origin access is
  explicit and disabled by default. One initialized application owns resources
  per JavaScript realm; independent workers or processes may run in parallel.
- The framework targets Node.js 24+, ESM, TypeScript, and an Apache-2.0 license.

The shipped authenticated REST, GraphQL, soft-delete, nested-write,
virtual-result, and contextual relation-filter vertical is demonstrated by the
[`examples/minimal`](examples/minimal/README.md)
application. It exercises network-independent GraphQL execution and the
optional Yoga HTTP adapter beside REST, including atomic pointer and relation
writes, both soft-delete modes, private Master restoration and purge, plus
request-aware output-only fields whose persisted dependencies stay private and
relation views shaped from authentication context, while GraphiQL and Apollo
Sandbox remain separate development plugins.

## Repository map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): system boundaries, dependency graph,
  rebuilt module layout, and rebuild simplifications.
- [`docs/current-architecture.md`](docs/current-architecture.md): current
  contracts, responsible packages, and accepted decisions by concept.
- [`ROADMAP.md`](ROADMAP.md): proposed product directions.
- [`docs/`](docs/README.md): concepts, specifications, and ADRs.
- [`docs/concepts/open-plugin-authoring.md`](docs/concepts/open-plugin-authoring.md): accepted open-plugin authoring and consumption target.
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

# UltimaBase

UltimaBase is an open-source, Node.js-first backend framework for building typed data APIs from static TypeScript schemas.

It takes inspiration from the simplicity of Parse Server while deliberately replacing its limitations with stronger inference, explicit plugin boundaries, a single operation engine, immutable class-based builders, and first-class PostgreSQL support.

> Status: active pre-release development. The implementation is tracked as small issues under [`issues/`](issues/README.md).

## Intended developer experience

The schema, Query, network-independent GraphQL, and Yoga HTTP APIs below are
shipped.

```ts
import { typegenPlugin } from '@ultimabase/typegen'
import { Schema, UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'

export const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string({
			required: true,
		}),
		isActive: field.boolean({
			default: true,
		}),
	}),
})

const activeUsersInput = { where: { isActive: { eq: true } } } as const
```

```ts
const ultimabase = new UltimaBase({
	schemas: [UserSchema],
	plugins: [
		typegenPlugin(),
		postgresPlugin({
			url: env.DATABASE_URL,
		}),
		httpPlugin({ appId: 'main' }),
		graphqlPlugin(),
		graphqlYogaPlugin(),
		honoServerPlugin(),
	],
})

await ultimabase.start()

const draft = new UserSchema({ name: 'Ada' })
```

```ts
const users = await UserSchema.findMany(
	{ ...activeUsersInput, limit: 25 },
	{ ultimabase },
)

users[0] instanceof UserSchema // true
users[0]?.toJSON() // A detached immutable object.
```

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
- Typegen may include plugin-owned contracts but generates declarations only;
  JavaScript applications run without Typegen or a generated client.
- Stable plugin operations and application-specific model surfaces execute
  through application-owned handles rather than mutating exported schema classes.
- The official soft-delete plugin can preserve native delete as a tombstone
  rewrite or add an independently authorized `softDelete` mutation. Ordinary
  reads stay tombstone-blind, while audited `restore` and `purge` commands remain
  private to trusted server code.
- Owner-private plugin records retain typed transactional persistence and
  migration provenance without becoming application schemas, Query or Typegen
  surfaces, generated transport routes, or application behavior inputs.
- PostgreSQL synchronization and PostgreSQL migrations are separate capabilities.
- Milestone 23 delivers HTTP application identity,
  Fetch-compatible route composition, and request context resolution in an
  optional HTTP plugin. Hono only provides the server, REST and GraphQL remain
  sibling transports, and Password Auth adds identity without granting
  authorization.
- That target enters Runtime through a narrow Core request-execution capability
  rather than giving HTTP the application engine. Cross-origin access is
  explicit, disabled by default, and consistent across applications sharing one
  server.
- The framework targets Node.js 24+, ESM, TypeScript, and an Apache-2.0 license.

The shipped authenticated REST, GraphQL, soft-delete, nested-write, and
virtual-result vertical is demonstrated by the
[`examples/minimal`](examples/minimal/README.md)
application. It exercises network-independent GraphQL execution and the
optional Yoga HTTP adapter beside REST, including atomic pointer and relation
writes, both soft-delete modes, private Master restoration and purge, plus
request-aware output-only fields whose persisted dependencies stay private,
while GraphiQL and Apollo Sandbox remain separate development plugins.

## Repository map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): system boundaries and dependency graph.
- [`ROADMAP.md`](ROADMAP.md): milestone order.
- [`docs/`](docs/README.md): concepts, specifications, and ADRs.
- [`docs/concepts/open-plugin-authoring.md`](docs/concepts/open-plugin-authoring.md): accepted open-plugin authoring and consumption target.
- [`issues/`](issues/README.md): atomic implementation backlog.
- [`packages/`](packages/README.md): publishable `@ultimabase/*` packages.
- [`apps/`](apps/README.md): development playground and benchmarks.
- [`examples/`](examples/README.md): user-facing examples.
- [`tests/`](tests/README.md): cross-package integration and conformance tests.

## Development setup

UltimaBase requires Node.js 24 and the Yarn version declared by `packageManager`.

```sh
corepack enable
yarn install --immutable
yarn test
```

Corepack ensures that `yarn` uses the repository's pinned Yarn version instead of a globally installed Yarn Classic binary.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md) before making changes. Work should normally start from one issue file and respect its dependencies.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

# UltimaBase

UltimaBase is an open-source, Node.js-first backend framework for building typed data APIs from static TypeScript schemas.

It takes inspiration from the simplicity of Parse Server while deliberately replacing its limitations with stronger inference, explicit plugin boundaries, a single operation engine, immutable class-based builders, and first-class PostgreSQL support.

> Status: architecture and repository scaffold. The implementation is intentionally tracked as small issues under [`issues/`](issues/README.md).

## Intended developer experience

```ts
export const UserSchema = new Schema({
	className: 'User',
	fields: {
		name: stringField({
			validation: {
				required: true,
			},
		}),
		isActive: booleanField({
			default: true,
		}),
	},
})
```

```ts
const app = await createApplication({
	schemas: [UserSchema],
	plugins: [
		postgresPlugin({
			url: env.DATABASE_URL,
		}),
		honoServerPlugin({
			port: 1337,
		}),
		restPlugin(),
		graphqlYogaPlugin(),
	],
})
```

```ts
const users = await requestEngine
	.query(UserSchema)
	.equalTo('isActive', true)
	.limit(25)
	.find()
```

## Principles

- Static schemas are the source of truth.
- Concrete capabilities are plugins.
- Core and Runtime do not know infrastructure implementations.
- REST and GraphQL use one operation AST and one runtime pipeline.
- Schema, Query, ACL, and Role domain objects use immutable classes.
- CLP, ACL, roles, and field access are independent plugins.
- PostgreSQL synchronization and PostgreSQL migrations are separate capabilities.
- The framework targets Node.js 24+, ESM, TypeScript, and an Apache-2.0 license.

## Repository map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): system boundaries and dependency graph.
- [`ROADMAP.md`](ROADMAP.md): milestone order.
- [`docs/`](docs/README.md): concepts, specifications, and ADRs.
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

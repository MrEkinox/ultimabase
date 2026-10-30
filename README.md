<p align="center">
  <a href="https://ultimabase.dev">
    <img src="website/app/icon.svg" width="88" height="88" alt="UltimaBase">
  </a>
</p>

<h1 align="center">UltimaBase</h1>

<p align="center">
  <strong>Your data model. A working backend.</strong>
</p>

<p align="center">
  One access rule per model, enforced over GraphQL, REST and your server code.<br>
  Fully typed, no codegen, on your own PostgreSQL, and every capability is a plugin you choose.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ultimabase"><img src="https://img.shields.io/npm/v/ultimabase?color=2F5BFF&label=npm" alt="npm version"></a>
  <a href="https://github.com/MrEkinox/ultimabase/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/MrEkinox/ultimabase/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/ultimabase?color=2F5BFF" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/ultimabase?color=2F5BFF" alt="Node.js"></a>
</p>

<p align="center">
  <a href="https://ultimabase.dev/docs"><b>Documentation</b></a> ·
  <a href="https://ultimabase.dev/docs/quickstart"><b>Quickstart</b></a> ·
  <a href="examples"><b>Examples</b></a> ·
  <a href="https://github.com/MrEkinox/ultimabase/releases"><b>Releases</b></a>
</p>

> [!NOTE]
> UltimaBase is pre-release: try it, build with it, tell us what breaks, but
> do not put it in production yet. Its API may still change before 1.0.

## Start

```bash
npm create ultimabase@latest
```

This writes an application with its models, a test and its server; `npm run
dev` serves it at `http://localhost:3000/graphql`. The
[quickstart](https://ultimabase.dev/docs/quickstart) walks through it.

## One model, one rule, every way in

A model declares its fields and who may read and write its rows:

<!-- examples/introduction/src/models.ts#post -->

```ts
import { defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
	}),
}).with({
	// Clients read the published posts; the other rules, left out, are
	// closed: only server code writes.
	access: { read: ({ where }) => where({ published: true }) },
})
```

The application picks its database and its plugins:

<!-- examples/introduction/src/app.ts#app -->

```ts
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000; serves /graphql and /api.
	plugins: [httpPlugin(), graphqlPlugin(), restPlugin()],
	models: [Post],
})
```

A client gets the published post, and never the draft:

<!-- examples/introduction/src/app.test.ts#read -->

```ts
// `{ as: master }` is your server code, past every rule: it writes a
// published post and a draft.
await Post.createMany(
	{ data: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
	{ as: master },
)
// `request` sends a GraphQL query as an anonymous client would.
expect(await request('{ posts { edges { node { title } } } }')).toEqual({
	data: { posts: { edges: [{ node: { title: 'Hello' } }] } },
})
```

Your own server code is held to the same rule, and its results are typed
from the model:

<!-- examples/introduction/src/app.test.ts#server -->

```ts
// Server code without `{ as }` reads as an anonymous client, so a
// forgotten caller never leaks a draft. The result is typed from the
// model: no generated code.
const found = await Post.findMany({ select: { title: true } })
expectTypeOf(found).toEqualTypeOf<{ readonly title: string }[]>()
expect(found).toEqual([{ title: 'Hello' }])
```

`GET /api/posts` answers the same over REST, and a client's `createPost` is
refused. These snippets are the tests of
[`examples/introduction`](examples/introduction), run on every commit.

## What you get

- **Access rules beside each model**, in TypeScript, applied to every
  transport and to your server code. [Access rules →](https://ultimabase.dev/docs/access)
- **Types from the models, no codegen**: queries, rules and hooks are typed as
  you write them. [Models →](https://ultimabase.dev/docs/models)
- **GraphQL and REST** generated from the models and functions, with the same
  names, operators and answers. [GraphQL →](https://ultimabase.dev/docs/graphql) · [REST →](https://ultimabase.dev/docs/rest)
- **Your own PostgreSQL**, synced to the models in development, migrated by
  reviewed SQL files in production. [PostgreSQL →](https://ultimabase.dev/docs/postgres)
- **Queries, relations and transactions** with filters, cursors and nested
  writes. [Queries →](https://ultimabase.dev/docs/queries) · [Relations →](https://ultimabase.dev/docs/relations) · [Transactions →](https://ultimabase.dev/docs/transactions)
- **Users, roles and per-row ACL**: sessions, password sign-in, roles that
  hold roles. [Authentication →](https://ultimabase.dev/docs/auth) · [Roles →](https://ultimabase.dev/docs/roles) · [ACL →](https://ultimabase.dev/docs/acl)
- **Hooks and functions** that run as their caller. [Hooks →](https://ultimabase.dev/docs/hooks) · [Functions →](https://ultimabase.dev/docs/functions)
- **Realtime** live lists and rows, under each client's own read rules.
  [Realtime →](https://ultimabase.dev/docs/realtime)
- **Files** in any S3-compatible storage, never left without their row.
  [Files →](https://ultimabase.dev/docs/files)
- **Tests on a new in-memory database** for each test, with Vitest.
  [Testing →](https://ultimabase.dev/docs/testing)
- **Everything else is a plugin**, written with the same contract as ours.
  [Plugins →](https://ultimabase.dev/docs/plugins)

## Packages

The kernel holds the models, queries, rules, hooks and the plugin contract;
each capability is a package you add.

| Package                                           | What it adds                                                    |
| ------------------------------------------------- | --------------------------------------------------------------- |
| [`ultimabase`](packages/ultimabase)               | The kernel, its command line and the in-memory database         |
| [`create-ultimabase`](packages/create-ultimabase) | `npm create ultimabase`: a new application, ready to start      |
| **Serve**                                         |                                                                 |
| [`@ultimabase/http`](packages/http)               | The HTTP server, with your own routes on Hono                   |
| [`@ultimabase/graphql`](packages/graphql)         | A GraphQL API generated from the models and functions           |
| [`@ultimabase/rest`](packages/rest)               | The same API in REST                                            |
| **Store**                                         |                                                                 |
| [`@ultimabase/postgres`](packages/postgres)       | PostgreSQL 15 or later, with migrations                         |
| **Identify and authorize**                        |                                                                 |
| [`@ultimabase/auth`](packages/auth)               | The user model, sessions and each request's caller              |
| [`@ultimabase/password`](packages/password)       | Sign-up and sign-in with an email and a password, with Argon2id |
| [`@ultimabase/roles`](packages/roles)             | Roles, roles that hold roles, and the `hasRole` rule            |
| [`@ultimabase/acl`](packages/acl)                 | Per-row rights: by user, by role, or for the public             |
| **Extend**                                        |                                                                 |
| [`@ultimabase/files`](packages/files)             | Files in S3 or any S3-compatible storage                        |
| [`@ultimabase/realtime`](packages/realtime)       | Live lists and rows over GraphQL subscriptions or SSE           |
| [`@ultimabase/live`](packages/live)               | Its client: SSE, an Apollo link and a React hook                |
| [`@ultimabase/soft-delete`](packages/soft-delete) | A trash: deleted rows leave the reads and can be restored       |
| [`@ultimabase/testing`](packages/testing)         | Test helpers for Vitest, and the database adapters' suite       |

## Coming from Parse Server or Supabase?

Like Parse Server, UltimaBase is a backend you run yourself, with models,
access rules, hooks and functions. Unlike Supabase's policies, written in SQL,
its rules are TypeScript beside each model, and apply to your server code too.
It is a library and a command line, not a hosted service: the application is
yours, and runs wherever Node.js runs.

## Contributing

You need Node.js 24.7 or later and Yarn, through Corepack:

```bash
corepack enable && yarn install
```

```bash
yarn validate
```

`yarn validate` checks the formatting, types, lint, line budgets and tests.
The PostgreSQL tests run with `docker compose up -d` and `yarn test:postgres`.

- [`docs/decisions.md`](docs/decisions.md) records every design choice, and
  [`docs/roadmap.md`](docs/roadmap.md) the current phase; a change builds on a
  recorded decision.
- [`AGENTS.md`](AGENTS.md) is the contract for contributors and coding agents.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org);
  a change to a package adds a changeset (`yarn changeset`).
- Report a vulnerability as [`SECURITY.md`](SECURITY.md) explains, never in an
  issue. Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE)

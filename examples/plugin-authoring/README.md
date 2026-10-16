# Plugin authoring example

A small blog backend that installs the plugins the
[Build a Plugin](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/index.mdx)
pages teach, each one in its own short file: a starter plugin with a typed
setup export, `definePlugin` plugins with a feature, commands and a `.with`
rule, a feature that requires its rule, a raw plugin typing its feature,
field and rule through Core's slots, a field kind and a field option, two plugins meeting through a
capability, a lifecycle-only resource, owner-private storage, an operation
bound to GraphQL and REST, an independent GraphQL schema, an HTTP route, and
an environment-dependent default. It uses the declaration form
without generated files and is tested with `testApplication` and the plugin
conformance suite of `@ultimabase/testing`.

The Build a Plugin pages, the Test an Application page, and the
[Plugin Kit](../../packages/plugin-kit/README.md) and
[Testing](../../packages/testing/README.md) READMEs show this example's code:
each block is a `//#region <name>` of these files, included by the pages and
copied into the READMEs by `yarn docs:regions`. Change the code
here, and the tests prove what the documentation says.

## Files

| File                                                                       | What it shows                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`src/starter-plugin.ts`](src/starter-plugin.ts)                           | an inert factory with an optional `instanceId` and a typed setup export                          |
| [`src/archive-plugin.ts`](src/archive-plugin.ts)                           | `definePlugin` with the `archivable` feature, a server-written field and two commands            |
| [`src/audit-plugin.ts`](src/audit-plugin.ts)                               | `definePlugin` with an `audit` rule read by `afterCommit`                                        |
| [`src/review-plugin.ts`](src/review-plugin.ts)                             | `definePlugin` with a `reviewable` feature that requires its `review` rule                       |
| [`src/flag-plugin.ts`](src/flag-plugin.ts)                                 | a raw plugin: `flaggable`, a field and a rule typed through Core's slots, an additive patch      |
| [`src/rating-plugin.ts`](src/rating-plugin.ts)                             | a field family for virtual outputs and a field option for stored fields                          |
| [`src/format-capability.ts`](src/format-capability.ts)                     | a capability token, its provider and a consumer reading it                                       |
| [`src/client-plugin.ts`](src/client-plugin.ts)                             | a lifecycle-only application resource                                                            |
| [`src/sessions-plugin.ts`](src/sessions-plugin.ts)                         | owner-private storage with its critical `storage:private` reason, used by the plugin's operation |
| [`src/run-plugin-callback.ts`](src/run-plugin-callback.ts)                 | cooperative cancellation around a callback                                                       |
| [`src/trace-plugin.ts`](src/trace-plugin.ts)                               | a default derived from `NODE_ENV` in the factory, logged at debug level                          |
| [`src/workflow/`](src/workflow/plugin.ts)                                  | an application operation, its typed GraphQL binding, and the plugin that owns both               |
| [`src/graphql-addon.ts`](src/graphql-addon.ts)                             | an independent `GraphQLSchema` with a `peers` range on the GraphQL plugin                        |
| [`src/status-route.ts`](src/status-route.ts)                               | an HTTP route contributed by a plugin                                                            |
| [`src/schema.ts`](src/schema.ts)                                           | the factory with the schema plugins, `Post` and `Comment`                                        |
| [`src/ultimabase.ts`](src/ultimabase.ts)                                   | the application with the other plugins and the `Register` declaration                            |
| [`src/main.ts`](src/main.ts)                                               | the development entry point                                                                      |
| [`tests/starter.test.ts`](tests/starter.test.ts)                           | the setup export and the common conformance suite                                                |
| [`tests/schema-contributions.test.ts`](tests/schema-contributions.test.ts) | the features, commands over TypeScript, REST and GraphQL, the rule after commit                  |
| [`tests/features-and-rules.test.ts`](tests/features-and-rules.test.ts)     | a feature in `define`, its required rule in `.with`, the missing rule, a rule in `define`        |
| [`tests/schema-misuse.test.ts`](tests/schema-misuse.test.ts)               | a rule in `define`, without its feature, without its plugin; a peer range; a Core range          |
| [`tests/field-kinds.test.ts`](tests/field-kinds.test.ts)                   | the field kind and the field option in a second application                                      |
| [`tests/runtime.test.ts`](tests/runtime.test.ts)                           | the capability, the lifecycle resource, cancellation and private storage                         |
| [`tests/operations.test.ts`](tests/operations.test.ts)                     | the operation in TypeScript, GraphQL and REST, the GraphQL schema and the HTTP route             |
| [`tests/conformance.test.ts`](tests/conformance.test.ts)                   | conformance suites with schemas, two instances, a support plugin and an optional check           |
| [`tests/first.test.ts`](tests/first.test.ts)                               | a first `testApplication` test                                                                   |
| [`tests/test-application.test.ts`](tests/test-application.test.ts)         | the `testApplication` handle and `waitForAfterCommit`                                            |
| [`tests/logger.test.ts`](tests/logger.test.ts)                             | the capturing logger and the derived default                                                     |
| [`tests/options.test.ts`](tests/options.test.ts)                           | plugin option parsers                                                                            |
| [`tests/postgres-worker.test.ts`](tests/postgres-worker.test.ts)           | a worker-owned PostgreSQL schema for a plugin's own tests                                        |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

The plugins declare `core: '^0.0.0'` and `peers` ranges of `^0.0.0` because
the pre-release packages are version `0.0.0`; the Core range is checked against
the installed Core's version and a peer range against the installed plugin's
version.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-plugin-authoring typecheck
corepack yarn workspace @ultimabase/example-plugin-authoring test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_plugins \
	corepack yarn workspace @ultimabase/example-plugin-authoring start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on `http://127.0.0.1:1337/api` and
GraphQL on `/graphql`. REST and GraphQL accept writes from every client
(`publicWrites: true`) to keep the example short; install Access before
exposing an application. The PostgreSQL `override` schema policy (the default
outside production) is convenient for this development example and is not a
production migration strategy.

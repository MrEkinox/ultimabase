# @ultimabase/create-app

The standalone UltimaBase project initializer. Its proposed entry points are
`npm create @ultimabase/app@latest`, `yarn dlx @ultimabase/create-app@latest`,
`pnpm dlx @ultimabase/create-app@latest`, and
`npx @ultimabase/create-app@latest`. The package has not been published:
`npm create @ultimabase/app` works only once the packages are published. See
the [Quick Start](../../apps/website/content/docs/1.0.0/quick-start.mdx) for
the complete future reader path.

The interactive and flag-only selection flows normalize to one project plan.
The local executable generates a PostgreSQL project in TypeScript or
JavaScript, with either a runnable Task starter or an empty application.

## The default starter (ADR-0327)

The prompts and `--yes` select the same defaults: TypeScript, REST, Access in
prototype mode, the Task starter, and PostgreSQL in Docker Compose.

- **Scripts.** `dev` runs `node --watch --env-file=.env src/main.ts`: Node 24
  runs the TypeScript sources without a build. `test` runs Vitest. TypeScript
  projects also have `typecheck` (`tsc`), `build` (`tsc -p
tsconfig.build.json`) and `start` (the compiled `dist/main.js`); JavaScript
  projects have `start` on the sources.
- **Prototype Access.** With Access, the starter installs
  `accessPlugin({ allowWithoutRule: { all: 'development' } })`: every
  operation without a rule works in development, with a warning at start, and
  `NODE_ENV=production` refuses to start until `.with({ access })` rules
  replace the opening. REST and GraphQL then expose Task writes, which Access
  decides. Without Access, the data APIs stay read-only.
- **First test.** `tests/task.test.ts` starts the application with
  `testApplication` from `@ultimabase/testing` and creates a Task (and lists
  it over REST or GraphQL when selected). `vitest.config.ts` spreads
  `ultimabaseTesting()`: PostgreSQL starts once in a container, or comes from
  `TEST_DATABASE_URL`.
- **Database.** Docker Compose is the default (`docker compose up -d --wait`).
  When `docker compose` does not answer, the initializer says so and uses an
  existing database; the prompt then offers its URL, written to the ignored
  `.env` (`--database-url` in flags).
- **Declaration form.** Generated schemas use the declaration form only
  (ADR-0297): data in `define(...)`, shape methods such as `.softDelete()` and
  `.acl()`, then rules in a final `.with(...)` only when a schema has rules.
  There is no generation script and no generated file; the
  application declares itself once in `Register`.
- **Style.** create-app's tests check every representative generated project
  with Prettier (single quotes, no semicolons) and the recommended ESLint and
  typescript-eslint rules.

`--api none` and `--plugin none` select nothing explicitly in non-interactive
mode.

## Plugins

The generated schema module owns one plugin list, used both for source
inference and for Runtime installation. Hooks, Validation, and Soft Delete
can be selected. The Task example configures schema-local Hooks, Validation,
and recoverable native deletes when selected. PostgreSQL Vector is not
offered until it persists vector fields; `--plugin
@ultimabase/pg-vector-plugin` fails with that reason. Authentication, Access,
Roles, and Object ACLs also generate valid application graphs.
Authentication installs `authPlugin({ methods: [password({ identifier: 'email' })] })`
(`@ultimabase/auth-plugin` and `@ultimabase/auth-password`) and declares the
User through `SchemaApplication.UserSchema.define(...)`, matching the
configured Role form; it adds sessions without granting Task access and needs
no Master key. When Access is selected too, the User's `.with({ access })`
rules expose only the session owner, so sign-up, login, and refresh can
return their required profile, and deny direct User writes. Object ACLs start
empty and deny ordinary Task reads, updates, and deletes, but do not govern
creation. Roles define membership identities without granting access by
themselves. Object ACLs and Roles configure a development Master audit and
require a private key in the ignored `.env`; the initializer generates it
whenever it writes `.env`.

The API selector composes REST or GraphQL over HTTP with the HTTP boundary
and a managed Hono listener on `127.0.0.1:1337`, through one
`...apiServer({ rest, graphql })` entry from `@ultimabase/api-server`
(ADR-0325). Advanced choices can install HTTP without a listener,
network-independent GraphQL, or the development-only GraphiQL page at
`/graphiql`. Internal member and role schemas remain off generated routes.
Authentication serves its operations under `/api/auth` (Bearer, or a cookie
for browsers once configured); GraphQL exposes the same operations and REST
hides them. A valid session still grants no Task permission. Browser-origin
access and HTTP Master keys remain disabled; requests need no application
header. The generated README gives exact local request examples and
deployment boundaries.

Run the built local executable with `node dist/cli.js --help`, or generate a
base project with `node dist/cli.js --name notes --yes --no-install`. The
selection validates npm package names, available plugin IDs, plugin
prerequisites, and a new destination. The grouped prompt includes 14 official
plugins. `--yes` never authorizes overwriting an existing target.
Incompatible selections fail before any files are written.

The generated project uses PostgreSQL `schemaPolicy: 'override'` only for
disposable local databases. HTTP listeners bind to loopback. Use the
generated README and the owning plugin guides before changing these defaults.
Packed-project verification covers the archive shape, all official plugin
selections, TypeScript builds against local compiled packages, the generated
test, and the production refusal of the prototype opening. Registry
installation and the advertised commands still require package publication
and a post-publication smoke test.

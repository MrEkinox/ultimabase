# @ultimabase/create-app

The standalone UltimaBase project initializer. Its proposed entry points are
`npm create @ultimabase/app@latest`, `yarn dlx @ultimabase/create-app@latest`,
`pnpm dlx @ultimabase/create-app@latest`, and
`npx @ultimabase/create-app@latest`. The package has not been published. See
the [Quick Start](../../apps/website/content/docs/1.0.0/quick-start.mdx) for
the complete future reader path.

The interactive and flag-only selection flows normalize to one project plan.
The local executable now generates a PostgreSQL project in TypeScript
or JavaScript, with either a runnable Task starter or an empty application.
The Task starter seeds its example record only when no Task exists, so
restarting the generated application never adds another record.
The generated schema module owns one configured application factory so a
plugin is declared once for both source inference and Runtime installation.
When REST or GraphQL is selected, its exposure option and exact operation
allowlist join that factory before schema declaration. The Runtime module extends the same
flat chain with database, HTTP, Hono, and other selected plugins instead of
repeating a plugin list.
Hooks, Validation, and Soft Delete can be selected today. The Task example
configures schema-local Hooks, Validation, and recoverable native deletes when
selected. PostgreSQL Vector is not offered until it persists vector fields;
`--plugin @ultimabase/pg-vector-plugin` fails with that reason. Authentication,
Access, Roles, and Object ACLs also generate valid application graphs.
Authentication installs `authPlugin({ methods: [password({ identifier: 'email' })] })`
(`@ultimabase/auth-plugin` and `@ultimabase/auth-password`) and declares the User
through `SchemaApplication.UserSchema.define(...)`, matching the configured Role
form; it adds sessions without granting Task access and needs no Master key. When
Access is selected too, the User's `.with({ access })` read rule exposes only the
session owner so sign-up, login, and refresh can return their required profile.
Other User operations retain the deny default. Access denies ordinary Task operations in
the starter; ACLs start empty and deny ordinary Task reads, updates, and deletes,
but do not govern creation. Roles
define membership identities without granting access by themselves.
TypeScript automatically runs Typegen before typecheck and build; JavaScript
does not depend on Typegen or TypeScript. The database can be an existing
disposable instance or a generated local Docker Compose service. Access, Roles and
Object ACLs configure a development Master audit and require a private key in an
ignored `.env`. Docker mode generates that key locally; existing-database mode
requires replacing the `.env.example` placeholder. No security plugin adds a
public route by itself.

The API selector composes REST or GraphQL over HTTP with the HTTP boundary
and a managed Hono listener on `127.0.0.1:1337`, through one
`...apiServer({ rest, graphql })` entry from `@ultimabase/api-server`
(ADR-0325). Advanced choices can install HTTP without a listener,
network-independent GraphQL, or the development-only GraphiQL page at
`/graphiql`. Generated Task routes are read-only by default, and internal
member and role schemas remain off generated routes. Authentication serves its
operations under `/auth` (Bearer, or a cookie for browsers once configured);
GraphQL exposes the same operations and REST hides them. A valid session still
grants no Task permission. Browser-origin
access and HTTP Master keys remain disabled, and REST and GraphQL refuse
public writes without a policy plugin. The generated README gives exact local request examples and
deployment boundaries. Packed-project verification covers the archive shape,
all official plugin selections, and TypeScript builds against local compiled
packages.

Run the built local executable with `node dist/cli.js --help`, or generate a
base project with `node dist/cli.js --name notes --yes --no-install`. The
selection validates npm package names, available plugin IDs, plugin
prerequisites, and a new destination. The grouped prompt includes all 15
official plugins; Typegen is automatic for TypeScript and absent for
JavaScript. `--yes` accepts the documented defaults and never authorizes
overwriting an existing target. Incompatible selections fail before any files
are written.

The generated project uses PostgreSQL `schemaPolicy: 'override'` only for
disposable local databases. HTTP listeners bind to loopback. The starter's
REST refuses to start with public writes and no policy plugin; GraphQL's unverified-protection acknowledgement does not secure public routes. Use the
generated README and the owning plugin guides before changing these defaults.
Registry installation and the advertised commands still require package
publication and a post-publication smoke test.

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
Hooks, Validation, Soft Delete, and PostgreSQL Vector can be selected today.
The Task example configures schema-local Hooks, Validation, and recoverable
native deletes when selected. Vector remains a logical value contract here;
the starter does not persist vectors or claim vector search. Password Auth,
Access, Roles, and Object ACLs also generate valid application graphs. Password
Auth adds a User schema and sessions without granting data access. Access
denies ordinary Task operations in the starter; ACLs start empty and deny
ordinary Task reads, updates, and deletes, but do not govern creation. Roles
define membership identities without granting access by themselves.
TypeScript automatically runs Typegen before typecheck and build; JavaScript
does not depend on Typegen or TypeScript. The database can be an existing
disposable instance or a generated local Docker Compose service. Security
choices configure a development Master audit and require a private key in an
ignored `.env`. Docker mode generates that key locally; existing-database mode
requires replacing the `.env.example` placeholder. No security plugin adds a
public route by itself.

The API selector now composes REST or GraphQL over HTTP with the HTTP boundary
and a managed Hono listener on `127.0.0.1:1337`. Advanced choices can install
HTTP without a listener, network-independent GraphQL, or a development-only
GraphiQL or Apollo Sandbox page. Introspection is enabled only for a selected
explorer in development. Generated Task routes are read-only by default, and
internal member and role schemas remain off generated routes. Selecting
Password Auth together with REST or GraphQL adds its four exact operations to
that protocol's allowlist; a valid session still grants no Task permission.
The application ID header is required, browser-origin access and HTTP Master
keys remain disabled, and acknowledging unverified public protection is not a
security policy. The generated README gives exact local request examples and
deployment boundaries. Packed-project verification covers the archive shape,
all official plugin selections, and TypeScript builds against local compiled
packages.

Run the built local executable with `node dist/cli.js --help`, or generate a
base project with `node dist/cli.js --name notes --yes --no-install`. The
selection validates npm package names, available plugin IDs, plugin
prerequisites, and a new destination. The grouped prompt includes all 16
official plugins; Typegen is automatic for TypeScript and absent for
JavaScript. `--yes` accepts the documented defaults and never authorizes
overwriting an existing target. Incompatible selections fail before any files
are written.

The generated project uses PostgreSQL `schemaPolicy: 'override'` only for
disposable local databases. HTTP listeners bind to loopback. The starter's
unverified-protection acknowledgement does not secure public routes. Use the
generated README and the owning plugin guides before changing these defaults.
Registry installation and the advertised commands still require package
publication and a post-publication smoke test.

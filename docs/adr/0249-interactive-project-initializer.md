# ADR-0249: Project creation is a standalone interactive initializer

- Status: accepted
- Date: 2026-09-18
- Refines: ADR-0011, ADR-0184
- Relates to: ADR-0191, ADR-0225, ADR-0235, ADR-0238, ADR-0241

## Context

The public Quick Start previews a one-command application setup, but no
initializer exists. The manual path proves a small PostgreSQL application and
the Typegen guide proves declaration generation before a TypeScript build.
Developers need those steps assembled into a project they can inspect and edit,
with clear choices for language, HTTP APIs, official plugins, and local
PostgreSQL. JavaScript must run the same application without Typegen.

Issues 808 and 716 concern later commands for existing applications. Neither is
needed to create a project. Coupling the initializer to either would keep Quick
Start blocked and confuse static project generation with Runtime or Typegen
command ownership.

## Decision

### Identity and boundary

The publishable workspace is `packages/create-app` with package name
`@ultimabase/create-app` and one executable named `create-app`. Its proposed npm
entry point is `npm create @ultimabase/app@latest`. npm maps
`npm init @scope/name@version` to `@scope/create-name@version`; `create` is an
alias of `init` ([npm documentation](https://docs.npmjs.com/cli/v11/commands/npm-init/)).
Arguments to the initializer follow `--`, for example
`npm create @ultimabase/app@latest -- --name notes --yes`.

The package targets Node.js 24+, ESM, and npm, Yarn, and pnpm project output.
It depends on prompt and ordinary filesystem/process libraries, not on Core,
PostgreSQL, or the other plugins at runtime. It writes a new application that
depends on those packages. It does not modify Core, register framework
commands, load an existing application, or add a general `ultimabase` binary.
Issues 808 and 716 remain deferred and independent.

The package is not published by implementing this ADR. Quick Start must retain
an explicit unpublished-command warning until a separate release decision and
registry verification.

### One selection model

Interactive prompts and flags normalize to one immutable input with these
choices, in this order:

1. Project name and destination. The name is a valid npm package name; the
   destination defaults to a new directory with that name.
2. Language: `ts` (default) or `js`.
3. HTTP APIs: a multi-select of `rest` and `graphql`, empty by default.
4. Official plugins: a grouped multi-select of all currently shipped official
   plugin packages. The earlier API answer is reflected in the same selection;
   the user is never asked to select REST or GraphQL twice.
5. Starter: `task` (default) or `empty`.
6. PostgreSQL: `existing` (default) or `docker` for a disposable local Compose
   service.
7. Package manager and installation. Detect a clear invoking manager;
   otherwise ask in a TTY. Installation is on by default when explicitly
   confirmed and may be skipped.

The CLI shows a final plan with selected and automatically required packages,
generated files, capability limits, and next commands before writing. Prompt
labels describe capabilities, while stable flag values name exact package IDs.
The full catalog is a checked packaged snapshot, not a runtime import from the
private website. Repository tests compare it with the shipped `-plugin`
workspaces and the website's official catalog so additions cannot disappear
from the selector silently. `@ultimabase/graphql-http` is a support contract,
not a plugin. `@ultimabase/typegen` is selected by language rather than by the
plugin multi-select.

The equivalent flags are `--name`, `--directory`, `--language ts|js`, repeatable
`--api rest|graphql`, repeatable `--plugin @ultimabase/<name>-plugin`,
`--starter task|empty`, `--database existing|docker`,
`--package-manager npm|yarn|pnpm`, `--install` or `--no-install`, and `--yes`.
Duplicate values collapse deterministically. Unknown IDs, conflicting flags,
unsupported combinations, and invalid names fail before filesystem writes.
With no TTY, `--name` is required; `--yes` accepts the documented remaining
defaults, using npm when the invoking manager cannot be detected, and does not
authorize overwriting an existing destination. A
non-interactive invocation without `--yes` must provide every choice or fail
with the missing flag names. No prompt consumes a database URL or Master key
from command-line arguments, where process listings or shell history could
expose them.

### Plugin closure and truthful output

The selector includes all 16 current official plugin packages. PostgreSQL is
part of every generated project and appears as included. Selecting REST adds
the HTTP application plugin and managed Hono server. Selecting GraphQL in the
HTTP API question adds the GraphQL schema plugin, Yoga adapter, HTTP plugin,
and Hono server. A direct, advanced selection of the GraphQL schema plugin
without an HTTP API remains network-independent. Selecting GraphiQL or Apollo
Sandbox adds the GraphQL-over-HTTP prerequisites and enables introspection only
for development. The generated application never enables the explorers in
production by default.

Other dependencies and incompatibilities use a versioned, explicit catalog
resolved before generation. A selection cannot merely install a package while
the generated application omits its configured factory. When a selected plugin
needs schema-local configuration, the `Task` starter includes a working
example; the empty starter states that the installed plugin has no schema to
act on. An incompatible empty or mixed selection is rejected before writing
rather than producing an application that fails on startup. The CLI can explain
unsupported behavior but cannot label it working.

The PostgreSQL Vector plugin may be selected for its logical value contract,
but neither starter persists a vector field or claims vector storage/search.
Password Auth adds identity and sessions, not permission. It never implicitly
enables CRUD access, and its private operations remain unexposed until an exact
transport allowlist includes them. Access, Roles, and ACL remain distinct
choices. Generated HTTP examples bind to `127.0.0.1` and require the exact
application ID header; loopback is a development boundary, not authorization.
Any deliberate unverified-protection acknowledgement is shown as such and is
not described as a production policy. Browser-origin access and raw Master
transport remain disabled by default.

### Generated language and database paths

TypeScript output installs `@ultimabase/typegen`, includes `typegenPlugin()` in
the same application graph, emits `scripts/generate-types.mjs`, includes
`.ultimabase/**/*.d.ts` in `tsconfig.json`, and uses these scripts:

```json
{
	"generate:types": "node --env-file=.env scripts/generate-types.mjs",
	"typecheck": "node --env-file=.env scripts/generate-types.mjs && tsc --noEmit",
	"build": "node --env-file=.env scripts/generate-types.mjs && tsc",
	"start": "node --env-file=.env dist/main.js"
}
```

The generated script reuses `@ultimabase/typegen`'s public loader, generator,
and writer for the configured application; it does not define another Typegen
engine. Typegen output contains only replaceable declarations and inert
metadata, never a Runtime client. JavaScript output has `.js` source files and
`"start": "node --env-file=.env src/main.js"`; it installs no Typegen or
TypeScript package, produces no `tsconfig.json`, and runs without generated
declarations.

Both modes use ESM and a `DATABASE_URL` environment variable. The existing
database path writes `.env.example` and instructs the developer to create an
ignored `.env` before running commands. Typegen loads configuration but does
not connect to PostgreSQL; a syntactically usable URL is enough for generation.
The Docker path writes a development-only Compose service, creates ignored
local credentials using cryptographic randomness, and prints `docker compose
up -d` before application commands. Generated schema synchronization may use
the direct `override` policy only for this disposable local exercise; it is
not represented as a production migration strategy.

Every output contains `package.json`, `.gitignore`, `.env.example`, and
`src/schema`, `src/ultimabase`, and `src/main` with the chosen `.ts` or `.js`
extension. TypeScript additionally contains `tsconfig.json` and
`scripts/generate-types.mjs`; `.ultimabase/schema.generated.d.ts` appears after
generation, not as a Runtime source file. Docker mode adds `compose.yaml` and
an ignored `.env`.

After `cd <directory>` and, for Docker mode, `docker compose up -d`, the
TypeScript next steps are exact:

| Manager | Typecheck           | Build           | Start        |
| ------- | ------------------- | --------------- | ------------ |
| npm     | `npm run typecheck` | `npm run build` | `npm start`  |
| Yarn    | `yarn typecheck`    | `yarn build`    | `yarn start` |
| pnpm    | `pnpm typecheck`    | `pnpm build`    | `pnpm start` |

JavaScript skips typecheck and build; its next step is `npm start`,
`yarn start`, or `pnpm start`. Existing-database output replaces the Compose
command with creating and editing `.env`. If installation was skipped, the
selected manager's `npm install`, `yarn install`, or `pnpm install` comes before
these commands. Instructions must match the actual generated package scripts,
not a prose-only idealization.

### Filesystem and failure semantics

Validate all choices and the destination before writing. Never overwrite or
merge into an existing path, and never use an implicit force
flag. Cancellation before the final confirmation leaves the destination
untouched. Write into an initializer-owned temporary sibling directory and
move it into place only after generation and optional dependency installation
have succeeded. On generation or install failure, remove only that owned
temporary directory and report a retryable error; do not delete user files.
Local `.env` and Master secrets are ignored by Git, never logged, and never
embedded in generated Typegen declarations. Templates and packages use only
public package-root imports and current plugin contracts.

## Consequences

The new package owns one small job: create a project from already shipped
contracts. The static catalog and templates need repository conformance tests
as official plugins evolve. Some valid advanced plugin selections add no
schema behavior to an empty application; the final plan and Quick Start must
explain that honestly. A selection requiring a new Core capability, storage
compiler, transport route, or security exception stops for a separate ADR
instead of expanding the initializer's scope.

The current website's `npm create ultimabase-app@latest` preview must be
updated to the scoped command only when the implementation and its packaged
entry point are verified. It remains visibly unavailable until publication.

# Decisions

The design of UltimaBase, decided with the maintainer before any code is
written. One entry per decision; a later entry may replace an earlier one by
naming it.

Entries also cover features planned after the first release. Code written
today follows them: when a planned feature needs a shape now, build that
shape now instead of reworking it later.

Each entry uses this shape:

```md
## D-01: Title

Choice: what we do.
Why: the reason, from experience when there is one.
Rejected: the alternatives and why.
Example: the code a developer writes.
```

## D-01: A bare kernel that grows by plugins

Choice: UltimaBase targets developers coming from Parse, Supabase, Prisma,
Payload or a hand-written backend. The kernel alone is the most basic system
possible; every capability (authentication, permissions, transports, storage,
hooks…) is a plugin the developer adds when they need it, or writes when it
does not exist. The same tool fits a tiny public site storing a few records
with no authentication and a large application.
Why: the plugin ecosystem is what sets UltimaBase apart from other backend
frameworks; a small project must not pay for features it does not use.
Rejected: a batteries-included framework where features are switched off.
Example: to be written once the kernel API is decided.

## D-02: Storage is a dedicated, explicit slot, not a plugin

Choice: an application has exactly one storage adapter, given in its own
required `database` option rather than in the plugin list. The in-memory
adapter ships with the kernel and is chosen by name like any other;
PostgreSQL is a separate package. Adapters implement one public contract, and
one shared contract suite runs against each of them (transactions included).
Why: storage is mandatory and unique, unlike plugins, which are optional and
combinable; a dedicated slot makes both rules structural instead of runtime
checks. Naming the in-memory adapter keeps a first application and the test
suite free of Docker while making it obvious that data disappears on restart.
Rejected: storage as a plugin (the previous design), which needed checks for
"none" and "two"; an implicit in-memory default, which lets a forgotten option
run production on memory.
Example:

```ts
const App = UltimaBase.create({ database: postgres() }).use(rest())
const Demo = UltimaBase.create({ database: memory() })
```

## D-03: Transports are optional plugins

Choice: REST and GraphQL are plugins. Without them, the developer writes their
own routes and calls the internal API. No transport is installed by default.
Why: most applications use a small part of what an all-in-one server ships.
Rejected: a built-in HTTP server.

## D-04: Closed by default, opened in one rule

Choice: a schema exposed by a transport refuses reads and writes until the
developer opens it. Opening takes one ready-made rule on the schema (D-10).
Why: forgetting a rule must never publish a writable database, and opening a
tiny public site must not need an authorization plugin.
Rejected: open by default; opening through a verbose rule object.
Example: `.with({ access: allow.public })`.

## D-05: TypeScript 7 and Oxlint

Choice: TypeScript 7 is the only compiler. Linting uses Oxlint with type-aware
rules through tsgolint.
Why: TypeScript 7 is the current stable release; typescript-eslint supports
TypeScript up to 6.0 only, and Oxlint is native and much faster.
Rejected: keeping TypeScript 6 for lint alongside TypeScript 7.

## D-06: Agent-first, measured by speed

Choice: the repository is built so an agent can make a typical change and
verify it in minutes. Rules live in tools (types, lint, CI checks, generators)
rather than in documents; an agent reads `AGENTS.md` and the package it
touches, nothing else. Budgets enforced by CI: `yarn validate` under one
minute locally, PostgreSQL tests in a separate command, file and package line
limits.
Why: the previous base slowed down until a small change took a day (slow
tests, many documents to check, gates on every merge, invented structure).
Rejected: process documents per change (ADRs, handoffs, audits) as the main
safety net.

## D-07: Schemas keep the `define(...).with(...)` shape

Choice: a schema is declared with `define({ ... })`, which holds the data
model, followed by `.with({ ... })`, which holds what plugins add. The details
(field syntax, defaults, rule spelling) are decided in later entries.
Why: the previous base reached this shape after many iterations and proved it
clear and well typed; restarting does not reopen it.
Rejected: starting the schema API over from a blank page.

## D-08: Fields are required unless marked optional

Choice: a field is required by default; `optional: true` marks the exception.
Why: most fields are required, so the previous `required: true` repeated on
nearly every field; Zod, Prisma and TypeScript use the same default.
Rejected: Parse's optional-by-default.

## D-09: The first field types include relations

Choice: the first release ships string, number, boolean, date, json, enum,
pointer (one target) and relation (many targets, including the inverse side of
a pointer). Bigint, decimal, time, binary and uuid come later, on demand.
Why: relations shape the data model and the query API, so they must be designed
from the start; the other types are additions that change nothing else.
Rejected: shipping every type of the previous base from the start.

## D-10: Access rules are functions, with ready-made ones

Choice: an access rule is always a function. The kernel exports ready-made
rules under `allow` (`allow.public`, `allow.readOnly`, `allow.private`);
plugins export their own (`isAuthenticated` from auth); rules combine with
helpers such as `anyOf`. One rule may cover the whole schema or each operation.
Why: DX is UltimaBase's first goal. One concept instead of words plus
functions; a developer jumps to a rule's source to see what it does; rules
compose; plugins add rules without a typed registry of words. The previous
five-key object, modelled on Keystone, was verbose for the common cases.
Rejected: string words (`'public'`), whose meaning hides inside the access
implementation; a per-operation object as the only form.
Example:

```ts
.with({ access: allow.public })
.with({ access: { read: allow.public, write: isAuthenticated } })
.with({ access: { read: ({ where }) => where.eq('archived', false) } })
```

## D-11: No type generation

Choice: every type comes from TypeScript inference on the code the developer
writes. No generator, no generated file, no build step for types.
Why: type generation is a major flaw of other backend frameworks: an extra
command, files out of sync with the code, slower feedback.
Rejected: any form of typegen, even optional.

## D-12: The same `(data).with(plugins)` shape for schemas and fields

Choice: a field is built by an imported function whose options describe the
data (`string({ optional: true })`); an optional `.with({ ... })` on the field
holds plugin rules for that field, as `.with` on the schema holds rules for the
whole schema. A rule sits next to the object it governs. A schema feature that
adds data (fields, storage) goes in `define`; a rule that adds behaviour goes in
`.with`.
Why: one rule to learn at both levels; no rules map keyed by field names far
from the fields; no `(field) => ...` callback.
Condition: accepted once a benchmark on a large schema shows editor typing
cost no worse than the previous form D on TypeScript 7. If it fails, this entry
is replaced.
Rejected: plugin options inside field options (mixes data and behaviour); a
per-field rules map in the schema's `.with` (rules far from their fields).
Example:

```ts
export const Todo = define({
	className: 'Todo',
	fields: {
		title: string().with({ input: (value) => value.trim() }),
		done: boolean({ default: false }),
		assignee: pointer(() => User, { optional: true }),
	},
}).with({ access: allow.public })
```

## D-13: Plugins with a schema of their own export a `define` alias

Choice: a plugin that needs a specific kind of schema exports its own entry,
named `define<Kind>` (roles: `defineRole`), which builds an ordinary schema
through the kernel's `define`. An application may have several role schemas,
each with its own custom fields.
Why: the kind of a schema is visible from its first word, while the kernel
keeps one schema entry and knows no plugin.
Rejected: a `RoleSchema.define` entry in the kernel; a `role` key inside
`define`, easy to miss in a long declaration.
Example:

```ts
export const TeamRole = defineRole({
	className: 'TeamRole',
	members: () => User,
	fields: { color: string({ optional: true }) },
})
```

## D-14: Functions over magic words

Choice: when a value carries behaviour, the API takes a function or an
imported value rather than a string keyword.
Why: a developer can jump to a function's source and read what it does; a
keyword's meaning is hidden inside the code that interprets it.
Rejected: string keywords for behaviour.

## D-15: A plugin adds features, commands and hooks

Choice: a plugin contributes features to `define` (fields, tables), commands
(new operations on a schema, such as `restore`) and hooks. Hooks are few and
fixed. On an operation, in this order:

1. Redirect: replace the operation with another one (soft delete turns
   `delete` into `update`). The replacement runs through the whole pipeline.
2. Restrict: refuse the operation or add a filter. Only narrows, never widens
   (access, validation, ACL).
3. Transform: change input or output data (trim, computed field, hidden
   field).
4. React: run inside the operation's transaction, after its write, and write
   more (create a user's profile when the user is created). A failure rolls
   everything back.
5. Observe: run after commit (email, webhook, cache).

Restrict, Transform and React receive the record as it was before the
operation. On the application: Identify (per request, before any operation,
fill a generic slot of the context with who is calling) and Start/Stop
(connect, listen, seed).
Why: the previous runtime had about eighteen stages; each hook here is needed
by a real plugin of the previous base (access, ACL, roles, hooks, soft delete,
auth, Postgres, HTTP) and has one nameable purpose.
Guards: at most one plugin may redirect a given operation on a given schema;
a conflict stops startup with a message naming both plugins. The model is
accepted once access, soft delete and an after-commit email plugin are
written with it, soft delete in under 150 lines (383 before).
Rejected: a hook per pipeline stage; a generic interceptor around everything.

## D-16: Plugins call each other directly

Choice: a plugin that needs another declares it (`requires: [roles()]`) and
calls its public API. Startup fails, naming the missing plugin, when a
requirement is not installed. The kernel has no service registry and no event
bus between plugins. HTTP routes belong to an HTTP plugin with which REST and
GraphQL register; the kernel knows no transport. The kernel exposes its
schemas read-only for transports and tools.
Why: a direct call can be followed in the editor in one click; the previous
capabilities and plugin events could not.
Rejected: kernel-level capabilities and plugin events.

## D-17: Soft-deleted rows are absent, the trash is read explicitly

Choice: a soft-deleted row does not exist for ordinary reads, for every
caller including Master. The trash is read through the plugin's own commands
(`Post.trash.findMany(...)`), which go through Restrict like any command;
Master passes, others need the permission.
Why: hiding deleted rows is the meaning of the data, not authorization, so
Master keeps bypassing authorization with no exception. A server job never
includes the trash by accident, and no filter on a magic field changes a
query's meaning.
Rejected: Master sees the trash (jobs include deleted rows silently); the
previous exception where Master kept the filter unless its `where` named
`isDeleted`.

## D-18: Queries start from the schema

Choice: operations are called on the schema object: `Post.findMany(...)`,
including plugin commands (`Post.trash.findMany(...)`). One initialized
application per JavaScript realm tells each schema where to run.
Why: completion lists every command after `Post.`, go-to-definition and
rename work, types are already carried by `Post`, and no string names a schema
(D-14). Frameworks that start from a client (`prisma.post`) generate that
client, which D-11 rules out.
Rejected: `app.findMany('Post', ...)`, whose string needs a global type lookup
on every call and breaks rename.

## D-19: One `as` option says who sends an operation

Choice: every operation takes `{ as: caller }`. `master` is a server-only
imported value; `ctx.caller` is the caller the Identify hook found for the
current request; a plain expression chooses between them. Without `as`, the
operation runs as anonymous. Plugins may add kinds of callers through
Identify; only the kernel creates `master`.
Why: Parse splits this between `useMasterKey` and `sessionToken`, which can be
passed together with an unclear priority. One option holds one caller, a
condition is a ternary, and a forgotten `as` fails closed (D-04) instead of
leaking.
Rejected: a `useMasterKey` boolean; separate master and session options.
Example:

```ts
Post.findMany({ where }, { as: fromBackOffice ? master : ctx.caller })
```

## D-20: The query API follows Prisma Client

Choice: operations, their names and their arguments follow Prisma Client, so
a developer coming from Prisma reads UltimaBase queries as Prisma: `findUnique`,
`findFirst`, `findMany`, `count`, `create`, `createMany`, `update`,
`updateMany`, `upsert`, `delete`, `deleteMany`, with `where`, `select`,
`include`, `omit`, `orderBy`, `take`, `skip` and `cursor`, and nested relation
filters (`some`, `every`, `none`) and writes (`connect`, `disconnect`).
Without `select`, scalar fields return and relations do not. UltimaBase
departs from Prisma only where a recorded decision says so: the caller
option (D-19), the schema as entry point (D-18), plugin commands on the schema.
The first release ships the subset needed by its examples; the rest follows
Prisma's spelling when added.
Why: Prisma's query API is the best-known in TypeScript and many frameworks
copied it; familiarity is free DX.
Later: Prisma's fluent relation API (`Post.findUnique(...).author()`), once it
can run without an extra query per parent (no N+1).
Rejected: a query syntax of our own; a function builder for `where` beside
the object form.

## D-21: Plugins are independent of each other

Choice: the kernel never imports, names or special-cases a plugin. Each plugin
works alone with the kernel whenever its purpose allows; `requires` (D-16) is
used only when a plugin cannot do its job without another one, never for
convenience. A plugin that enriches another one's behaviour when both are
present does it through the kernel's generic hooks, not through a hard
requirement.
Why: a developer adds exactly the bricks they need (D-01); a community plugin
must not drag a chain of other plugins with it.
Rejected: plugins that assume a standard set is installed.

## D-22: Every record has `id`, `createdAt` and `updatedAt`

Choice: the kernel adds `id`, `createdAt` and `updatedAt` to every schema; the
developer never declares them. `id` is a UUIDv7 string generated by the kernel.
Why: every record needs them, and `where`, `orderBy`, `cursor` and relations
rely on them. UUIDv7 is a standard, sorts by creation time (index locality,
stable cursors), is generated without a database round trip and is native to
PostgreSQL 18.
Rejected: Parse's `objectId` name; Prisma's declare-it-yourself ids; UUIDv4
and cuid (not time-sorted); auto-increment integers (leak volume, need the
database to create).

## D-23: Field validation uses Standard Schema or a function

Choice: a field's `validate` option takes any Standard Schema (Zod, Valibot,
ArkType…) or a plain function. Validation errors carry the field path.
Why: developers already know their validation library; the previous base's
validation worked well.
Rejected: a validation language of our own.

## D-24: One `Register` declaration types the application

Choice: the project declares its application once,
`declare module 'ultimabase' { interface Register { app: typeof app } }`, so
schemas, `.with` and plugin rules are typed from the installed plugins. The
starter template writes it.
Why: the previous base proved no alternative without type generation (D-11);
three lines once per project is an acceptable cost.
Rejected: type generation; passing the application to every `define`.

## D-25: Planned later, as plugins

Choice: these come after the first release, as plugins, and the design leaves
room for them now:

- GraphQL, generated from the schemas, as important as REST: the maintainer
  and many users work only in GraphQL.
- Files, early: memory, local and S3 adapters and a file field (shape still open).
- OAuth and magic link, early, as methods of the auth plugin.
- Realtime subscriptions, with access rules applied to each event.
- Scheduled and background jobs; an admin dashboard.
- Multi-tenancy, through Identify (the tenant is part of the caller) and
  Restrict (a tenant filter), with no kernel change.
- A typed browser client, much later; most users go through REST or GraphQL.
Why: knowing them now keeps today's code from blocking them.

## D-26: Migrations are SQL files, safe changes sync in development

Choice: in development, the PostgreSQL adapter applies safe changes at startup
(new table, new optional field, new index) and refuses destructive or ambiguous
ones (drop, rename, type change) with a message saying what to run.
`ultimabase migrate create` writes a reviewable, editable SQL file;
`ultimabase migrate deploy` applies committed files in production, where the
application refuses to start when the database does not match its schemas.
Migrations live in the PostgreSQL package; a shared package comes only with a
second SQL adapter. From the first release, the storage adapter contract
includes comparing schemas with the database and returning a plan.
Why: Parse migrations are hand-written queries run at startup, hard to follow
and slow; tracked SQL files are reviewable and replayable.
Rejected: the previous per-schema `override` / `fail` / `ignore` modes;
automatic destructive sync.

## D-27: Functions, exposed by transports, plus raw HTTP routes

Choice: `defineFunction({ name, input, output, run })` declares a server
operation with Standard Schema input and output (a schema object is accepted
as output). Every installed transport exposes it (a GraphQL query or mutation,
a REST endpoint); `.with({ ... })` sets its access, closed by default (D-04),
and where it is exposed (`.with({ rest: false })`). `run` receives the
validated input and the caller. For anything else (webhooks, redirects) the
HTTP plugin is built on Hono and the developer writes plain Hono routes with
the caller available.
Why: one declaration replaces one custom endpoint per transport, like Parse
Cloud Functions; GraphQL needs a runtime output type, which the output schema
gives. Hono routes need no new concept.
Rejected: a `defineRoute` wrapper around HTTP; functions per transport.
Example:

```ts
export const archiveTodo = defineFunction({
	name: 'archiveTodo',
	input: z.object({ id: z.string() }),
	output: Todo,
	run: ({ input, caller }) =>
		Todo.update({ where: { id: input.id }, data: { archived: true } }, { as: caller }),
}).with({ access: isAuthenticated, rest: false })
```

## D-28: Errors are hidden unless public

Choice: only a `PublicError` reaches clients; every other error is masked as
an internal error that carries a correlation id, also written to the server
log. Kernel errors have stable, typed codes (`ACCESS_DENIED`, `NOT_FOUND`,
`VALIDATION_FAILED`…); validation errors list the failing field paths.
Transports map codes to their own conventions (HTTP status, GraphQL
extensions).
Why: masking by default keeps internals private; the previous masked errors
left no trace to debug from.
Rejected: exposing error messages by default.

## D-29: Plugin order matters only where it must

Choice: hooks run in the fixed order of D-15. Within Restrict, results combine
with AND, so plugin order cannot change them. Within Transform, React and
Observe, plugins run in `.use(...)` order.
Why: security never depends on the order plugins were written in.
Rejected: explicit priorities.

## D-30: Package names

Choice: `ultimabase` holds the kernel and the in-memory adapter; official
plugins are `@ultimabase/<name>` (`postgres`, `graphql`, `rest`, `auth`…).
Community plugins are named `ultimabase-plugin-<name>` and carry the
`ultimabase-plugin` keyword, so they can be listed automatically.
Why: one obvious install for the kernel; the keyword is how Vite's ecosystem
is indexed.

## D-31: Examples are the documentation until release

Choice: `examples/` holds one folder per feature (`relation-many-to-many`,
`custom-function`…), each a small working project run by the test suite. The
documentation website and the landing page come back just before the first
release.
Why: a developer finds how to do something by opening its folder, and code
that runs in CI cannot be out of date. The previous website cost a lot to keep
in sync while the API moved.
Rejected: a documentation website during the design.

## D-32: Plugins add field types; files are a plugin

Choice: from the first release, a plugin can provide field types (`file()`,
later `vector()`), with their storage and transport representation. Files are
a plugin with a storage adapter (`memory()`, `local(...)`, `s3(...)`) and a
`file()` field; they are not a dedicated slot, since many applications store
no files.
Why: new field types brought by plugins are a core promise of UltimaBase.
Example:

```ts
UltimaBase.create({ database: postgres() }).use(files({ storage: s3({ bucket }) }))
define({ className: 'Post', fields: { cover: file({ optional: true }) } })
```

## D-33: Sign-in methods combine on one user

Choice: the `auth` plugin owns users, sessions and Identify; each sign-in
method is a plugin that requires it (`password()`, `magicLink()`,
`oauth({ google, github })`). One user may have several linked methods (email
and password plus Google), and a user can link or unlink a method.
Why: most applications offer more than one way to sign in to the same account.
Rejected: one plugin per method, each with its own users.

## D-34: GraphQL is the first transport

Choice: the first release ships the GraphQL transport, generated from the
schemas and functions; REST follows.
Why: one transport proves the model; GraphQL is the one the maintainer uses
daily and many users depend on.

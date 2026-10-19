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
possible: models, queries, the storage slot (D-02), access rules (D-10) and
hooks (D-43). Every other capability (authentication, roles, transports,
files…) is a plugin the developer adds when they need it, or writes when it
does not exist. The same tool fits a tiny public site storing a few records
with no authentication and a large application.
Why: the plugin ecosystem is what sets UltimaBase apart from other backend
frameworks; a small project must not pay for features it does not use.
Rejected: a batteries-included framework where features are switched off.
Example: to be written once the kernel API is decided.

## D-02: Storage is a dedicated, explicit slot, not a plugin

Choice: an application has exactly one storage adapter, given in its own
required `database` option rather than in the plugin list. The in-memory
adapter ships with the kernel and is imported like any other (`memory()`);
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
const App = UltimaBase.create({ database: postgres() }).use(graphql())
const Demo = UltimaBase.create({ database: memory() })
```

## D-03: Transports are optional plugins

Choice: REST and GraphQL are plugins. Without them, the developer writes their
own routes and calls the internal API. No transport is installed by default.
Why: most applications use a small part of what an all-in-one server ships.
Rejected: a built-in HTTP server.

## D-04: Closed by default, opened in one rule

Choice: a model exposed by a transport refuses reads and writes until the
developer opens it. Opening takes one ready-made rule on the model (D-10).
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

## D-07: Models keep the `defineModel(...).with(...)` shape

Choice: a model is declared with `defineModel({ ... })`, which holds
everything that shapes the model: its fields and the plugin features that add
fields or storage (soft delete). It is followed by `.with({ ... })`, which
holds what acts on the model once built: the kernel's `access` and `hooks` and
what plugins add (D-42). The details (field syntax, defaults, rule spelling)
are decided in later entries.
Why: the previous base reached this shape after many iterations and proved it
clear and well typed; restarting does not reopen it.
Rejected: starting the model API over from a blank page.

## D-08: Fields are required unless marked optional

Choice: a field is required by default; `optional: true` marks the exception.
Why: most fields are required, so the previous `required: true` repeated on
nearly every field; Zod, Prisma and TypeScript use the same default.
Rejected: Parse's optional-by-default.

## D-09: The first field types include relations

Choice: the first release ships `string`, `number`, `boolean`, `date`, `json`,
`enumOf` (`enum` is a reserved word in JavaScript) and the relations `one`
and `many` (D-37). Bigint, decimal, time, binary and
uuid come later, on demand.
Why: relations shape the data model and the query API, so they must be designed
from the start; the other types are additions that change nothing else.
Rejected: shipping every type of the previous base from the start.

## D-10: Access rules are functions, with ready-made ones

Choice: an access rule is always a function. The kernel exports ready-made
rules under `allow` (`allow.public`, `allow.readOnly`, `allow.private`);
plugins export their own (`isAuthenticated` from auth); rules combine with
helpers such as `anyOf`. One rule may cover the whole model or each operation.
The operations are `read`, `create`, `update` and `delete`; `write` is a
shorthand for `create`, `update` and `delete` (on a field, `create` and
`update`, D-44), and a specific key wins over `write`. A rule receives
`{ caller, operation }`, so one `write` function can handle every write by
testing `operation`.
Why: DX is UltimaBase's first goal. One concept instead of words plus
functions; a developer jumps to a rule's source to see what it does; rules
compose; plugins add rules without a typed registry of words. The previous
five-key object, modelled on Keystone, was verbose for the common cases.
Rejected: string words (`'public'`), whose meaning hides inside the access
implementation; a per-operation object as the only form.
Open: what else a rule receives and returns. Write rules will receive the
stored `record` (and the new `value`) and return a boolean. For reads, the
choice is between an explicit filter (`{ where: { ... } }`, Prisma's form,
run in the same round trip, D-46) and a hybrid: a rule on each row's `record`
for safety, plus an optional filter for speed and correct pagination.
Example:

```ts
.with({ access: allow.public })
.with({ access: { read: allow.public, write: isAuthenticated } })
.with({
	access: {
		read: allow.public,
		write: ({ operation, caller }) =>
			operation === 'delete'
				? caller.kind === 'master'
				: caller.kind === 'user',
	},
})
```

## D-11: No type generation

Choice: every type comes from TypeScript inference on the code the developer
writes. No generator, no generated file, no build step for types.
Why: type generation is a major flaw of other backend frameworks: an extra
command, files out of sync with the code, slower feedback.
Rejected: any form of typegen, even optional.

## D-12: The same `(data).with(plugins)` shape for models and fields

Choice: a field is built by an imported function whose options describe the
data (`string({ optional: true })`); an optional `.with({ ... })` on the field
holds plugin rules for that field, as `.with` on the model holds rules for the
whole model. A rule sits next to the object it governs. As for models
(D-07), what shapes the field goes in its options and what acts on it goes in
`.with`.
Why: one rule to learn at both levels; no rules map keyed by field names far
from the fields; no `(field) => ...` callback.
Condition: accepted once a benchmark on a large model shows editor typing
cost no worse than the previous base's field form (fields declared through a
`(field) => ({ ... })` callback) on TypeScript 7. If it fails, this entry
is replaced.
Rejected: plugin options inside field options (mixes data and behaviour); a
per-field rules map in the model's `.with` (rules far from their fields).
Example:

```ts
export const Todo = defineModel({
	name: 'Todo',
	fields: {
		title: string({ validate: z.string().trim() }).with({
			access: { update: isAuthenticated },
		}),
		done: boolean({ default: false }),
		assignee: one(() => User, { optional: true }),
	},
}).with({ access: allow.public })
```

## D-13: Plugins with a model of their own export a `define<Kind>` entry

Choice: a plugin that needs a specific kind of model exports its own entry,
named `define<Kind>` (roles: `defineRole`), which builds an ordinary model
through the kernel's `defineModel`. An application may have several role
models, each with its own custom fields.
Why: the kind of a model is visible from its first word, while the kernel
keeps one model entry and knows no plugin.
Rejected: a `RoleModel.define` entry in the kernel; a `role` key inside
`defineModel`, easy to miss in a long declaration.
Example:

```ts
export const TeamRole = defineRole({
	name: 'TeamRole',
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

Choice: a plugin contributes features to `defineModel` (fields, tables),
commands (new operations on a model, such as `restore`) and hooks. Hooks are few
and fixed, and an application writes the same ones (D-43). On an operation, in
this order:

1. `redirect` (plugins only): replace the operation with another one (soft
   delete turns `delete` into `update`). The replacement runs through the
   whole pipeline.
2. `beforeFind`, `beforeCreate`, `beforeUpdate`, `beforeDelete`: refuse the
   operation, add a filter that only narrows, never widens (access, ACL), or
   change the input data (trim, computed field).
3. `afterFind`: change the output. `afterCreate`, `afterUpdate`,
   `afterDelete`: run inside the operation's transaction, after its write, and
   write more (create a user's profile when the user is created). A failure
   rolls everything back.
4. `afterCreateCommit`, `afterUpdateCommit`, `afterDeleteCommit`: run after
   commit (email, webhook, cache). A failure is logged with a correlation id
   (D-28) and the operation still succeeds, since its write is committed;
   retries belong to a jobs plugin.

Write hooks receive the record as it was before the operation. The names
follow Parse (`beforeSave`) and Rails (`after_create_commit`). Plugins
alone also have application hooks: Identify (per request, before any
operation: the identity plugin, such as auth, fills `caller.user`, and another
plugin adds its own key, such as `caller.tenant`, D-19) and Start/Stop
(connect, listen, seed). Applications do not write these.
Why: the previous runtime had about eighteen stages; each hook here is needed
by a real plugin of the previous base (access, ACL, roles, hooks, soft delete,
auth, Postgres, HTTP) and has one nameable purpose.
Guards: at most one plugin may redirect a given operation on a given model,
two plugins may not add a command of the same name to one model, and only one
plugin may fill `caller.user`; each conflict stops startup with a message
naming both plugins. This design is
accepted once access, soft delete and an after-commit email plugin are
written with it, soft delete in under 150 lines (383 before).
Rejected: a hook per pipeline stage; a generic interceptor around everything.

## D-16: Plugins call each other directly

Choice: a plugin that needs another declares it (`requires: [auth]`) and
calls its public API. Startup fails, naming the missing plugin, when a
requirement is not installed. A plugin that can work without another lists it
in `optional: [roles]` and gets `Roles | undefined`; it reports a clear error,
and types its options accordingly, when a feature needs the absent plugin (an
ACL entry naming a role without `roles()` installed). The kernel has no
service registry and no event bus between plugins. HTTP routes belong to the
`http()` plugin, which owns the server (port, CORS, Hono routes); GraphQL and
REST require it and register on that one server, so both transports share one
listener unless the developer explicitly starts another. The kernel knows no
transport. The kernel exposes its models read-only for transports and tools.
Why: a direct call can be followed in the editor in one click; the previous
capabilities and plugin events could not.
Rejected: kernel-level capabilities and plugin events.

## D-17: Soft-deleted rows are absent, the trash is read explicitly

Choice: a soft-deleted row does not exist for ordinary reads, for every
caller including Master. The trash is read through the plugin's own commands
(`Post.trash.findMany(...)`), which go through `beforeFind` like any read;
Master passes, others need the permission.
Why: hiding deleted rows is the meaning of the data, not authorization, so
Master keeps bypassing authorization with no exception. A server job never
includes the trash by accident, and no filter on a magic field changes a
query's meaning.
Rejected: Master sees the trash (jobs include deleted rows silently); the
previous exception where Master kept the filter unless its `where` named
`isDeleted`.

## D-18: Queries start from the model

Choice: operations are called on the model object: `Post.findMany(...)`,
including plugin commands (`Post.trash.findMany(...)`). One initialized
application per JavaScript realm tells each model where to run.
Why: completion lists every command after `Post.`, go-to-definition and
rename work, types are already carried by `Post`, and no string names a model
(D-14). Frameworks that start from a client (`prisma.post`) generate that
client, which D-11 rules out.
Rejected: `app.findMany('Post', ...)`, whose string needs a global type lookup
on every call and breaks rename.

## D-19: One `as` option says who sends an operation

Choice: every operation takes `{ as: caller }`. `master` is a server-only
imported value; `caller` is the caller the Identify hook found for the
current request, which hooks, functions and HTTP routes receive as
`{ caller }`; a plain expression chooses between them. `caller.kind` is
`'anonymous'`, `'user'` or `'master'`; `caller.user` is set for a user,
`caller.master` (`{ source: 'code' | 'key' }`) for Master; plugins add their
own keys through Identify (`caller.tenant`). `{ as: caller }` runs with
whatever the caller is, Master included when the request came with the master
key (D-49), so hooks and routes never import `master`; server code without a
request (scripts, jobs) does. Without `as`, the operation runs as anonymous.
Only the kernel creates `master`.
Why: Parse splits this between `useMasterKey` and `sessionToken`, which can be
passed together with an unclear priority. One option holds one caller, a
condition is a ternary, and a forgotten `as` fails closed (D-04) instead of
leaking.
Rejected: a `useMasterKey` boolean; separate master and session options.
Example:

```ts
Post.findMany({ where }, { as: fromBackOffice ? master : caller })
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
option (D-19), the model as entry point (D-18), plugin commands on the model.
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

Choice: the kernel adds `id`, `createdAt` and `updatedAt` to every model; the
developer never declares them. `id` is a UUIDv7 string generated by the kernel.
Why: every record needs them, and `where`, `orderBy`, `cursor` and relations
rely on them. UUIDv7 is a standard, sorts by creation time (index locality,
stable cursors), is generated without a database round trip and is native to
PostgreSQL 18. Its characters (`0-9`, `a-f`, `-`) are unreserved in URLs, so
an id is used in a path or query string as is, never encoded or decoded, and
it reads the same in any letter case. Any future id format must keep both
properties. A shorter URL form is deferred.
Rejected: Parse's `objectId` name; Prisma's declare-it-yourself ids; UUIDv4
and cuid (not time-sorted); auto-increment integers (leak volume, need the
database to create).

## D-23: Field validation uses Standard Schema or a function

Choice: a field's `validate` option takes any Standard Schema (Zod, Valibot,
ArkType…) or a plain function. Its output is the stored value, so a schema
may transform it (`z.string().trim()`). Validation runs before the `before*`
hooks (D-15); a value a hook writes is not validated again, since hooks are
trusted server code. Validation is part of the kernel. Validation errors carry
the field path.
Why: developers already know their validation library; the previous base's
validation worked well.
Rejected: a validation language of our own.

## D-24: One `Register` declaration types the application

Choice: the project declares its application once,
`declare module 'ultimabase' { interface Register { app: typeof app } }`, so
models, `.with` and plugin rules are typed from the installed plugins. The
starter template writes it.
Why: the previous base proved no alternative without type generation (D-11);
name-keyed types read the models from it, and without it typing grows
quadratically (200 models: 73 s instead of 23 s on TypeScript 6). Cycles
between models are avoided as before: relation targets are thunks, callbacks
sit in the final non-generic `.with`, and the registry is read lazily by
model name. Three lines once per project is an acceptable cost.
Rejected: type generation.
Open: plugin keys in `defineModel` that change a model's shape (D-07) need the
plugin types while the model is typed, which a global `defineModel` cannot
read from `Register` without a cycle. Two options are spiked and benchmarked
with the `defineModel` prototype: models declared from the plugin set
(`const App = UltimaBase.use(softDelete())`, then `App.defineModel(...)` and
`App.defineRole(...)`, D-13), or each installed plugin adding its keys to a
global interface, with startup refusing a key whose plugin is not used.

## D-25: Planned later, as plugins

Choice: these come after the first release, as plugins, and the design leaves
room for them now:

- REST, right after GraphQL (D-34).
- Files, early, in the shape of D-32.
- OAuth and magic link, early, as methods of the auth plugin.
- Realtime subscriptions, with access rules applied to each event.
- Scheduled and background jobs; an admin dashboard.
- Multi-tenancy, through Identify (the tenant is part of the caller) and
  a `beforeFind` tenant filter, with no kernel change.
- A typed browser client, much later; most users go through REST or GraphQL.

Why: knowing them now keeps today's code from blocking them.

## D-26: Migrations are SQL files, safe changes sync in development

Choice: in development, the PostgreSQL adapter applies safe changes at startup
(new table, new optional field, new index) and refuses destructive or ambiguous
ones (drop, rename, type change) with a message saying what to run.
`ultimabase migrate create` writes a reviewable, editable SQL file;
`ultimabase migrate deploy` applies committed files in production, where the
application refuses to start when the database does not match its models.
The `migrate` commands belong to the kernel's `ultimabase` binary, which asks
the storage adapter for its plan; the PostgreSQL package implements it, and a
shared SQL package comes only with a second SQL adapter. From the first
release, the storage adapter contract includes comparing models with the
database and returning a plan.
Why: Parse migrations are hand-written queries run at startup, hard to follow
and slow; tracked SQL files are reviewable and replayable.
Rejected: the previous per-model `override` / `fail` / `ignore` modes;
automatic destructive sync.

## D-27: Functions, exposed by transports, plus raw HTTP routes

Choice: `defineFunction({ name, input, output, run })` declares a server
operation with a Standard Schema input and a typed output (D-45 lists the
accepted outputs). Every installed transport exposes it (a GraphQL query or
mutation, a REST endpoint); `.with({ ... })` sets its access, closed by
default (D-04), and where it is exposed (`.with({ rest: false })`). `run`
receives the validated input and the caller. For anything else (webhooks,
redirects) the HTTP plugin is built on Hono and the developer writes plain Hono
routes with the caller available.
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
		Todo.update(
			{ where: { id: input.id }, data: { archived: true } },
			{ as: caller },
		),
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

Choice: hooks run in the fixed order of D-15. Filters and refusals from `before`
hooks combine with AND, so plugin order cannot change them. Data changes and
`after` hooks run in `.use(...)` order, plugins first, then the application's
own hooks.
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
a plugin with a storage adapter (`memoryFiles()`, `local(...)`, `s3(...)`) and a
`file()` field; they are not a dedicated slot, since many applications store
no files.
Why: new field types brought by plugins are a core promise of UltimaBase.
Example:

```ts
UltimaBase.create({ database: postgres() }).use(
	files({ storage: s3({ bucket }) }),
)
defineModel({ name: 'Post', fields: { cover: file({ optional: true }) } })
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
models and functions; REST follows.
Why: one transport proves the design; GraphQL is the one the maintainer uses
daily and many users depend on.

## D-35: Public names follow one convention

Choice: a declaration the developer writes is `define<Thing>`, named after
UltimaBase's own noun (`defineModel`, `defineRole`, `defineFunction`); the
declared thing is named by a `name` key everywhere. Something plugged in or
configured (a plugin, an adapter, a field type) is a plain noun call
(`postgres()`, `files()`, `s3()`, `string()`, `file()`). Ready-made access
rules live under `allow`. A data declaration is a model, never a schema, in
the API, errors and documentation.
Why: one bare `define` beside `defineRole` and `defineFunction` read as an
accident; "model" matches Prisma (D-20), while "schema" already means Standard
Schema validators (D-23), the GraphQL schema (D-34) and Postgres schemas.
Rejected: a bare `define`; `defineSchema`; `defineCollection` (suggests a
document store); Parse's `className`.
Example:

```ts
export const Todo = defineModel({ name: 'Todo', fields: { title: string() } })
export const TeamRole = defineRole({ name: 'TeamRole', members: () => User })
export const archiveTodo = defineFunction({
	name: 'archiveTodo',
	input,
	output,
	run,
})
```

## D-36: Hooks share the operation's transaction; functions open their own

Choice: queries made inside an in-transaction hook join that transaction
without a `tx` argument (Node's `AsyncLocalStorage`). A `defineFunction` runs
without a transaction; the developer opens one explicitly with
`await transaction(async () => { ... })`. A single operation, with its
in-transaction hooks, is always atomic.
Why: a forgotten `tx` silently writes outside the transaction; a function
often calls external services (payments, email), and holding a transaction
open across a network call locks rows and sends effects before a rollback.
Rejected: passing `tx` by hand; a transaction around every function.

## D-37: Relations are `one` and `many`, declared on both sides

Choice: a relation field is `one(() => Target)` or `many(() => Target)`, and
both models declare their side. `one` facing `many` is one-to-many; `many`
facing `many` is many-to-many through a join table. When two relations join
the same models, `{ inverse: 'author' }` names the field on the other side,
typed from that model's fields. `one` facing `one` is one-to-one: the
required side stores the key (`Profile.user` required, `User.profile`
optional); when both sides are required or both optional, startup stops and
asks to make one optional. A missing side stops startup with a message saying
what to add.
Why: the cardinality reads from the word; both sides keep each model complete
on its own (colocation) and make the inverse explicit, as Prisma does.
Rejected: Parse's `pointer` and `relation`; an implicit inverse side.
Example:

```ts
export const Post = defineModel({
	name: 'Post',
	fields: { author: one(() => User), tags: many(() => Tag) },
})
export const User = defineModel({
	name: 'User',
	fields: { posts: many(() => Post) },
})
export const Tag = defineModel({
	name: 'Tag',
	fields: { posts: many(() => Post) },
})
```

## D-38: Node LTS and ESM only

Choice: the first releases target the active Node LTS, as ESM only.
Why: one runtime keeps drivers, crypto and file storage simple, and allows
`AsyncLocalStorage` (D-36).
Rejected: Bun, Deno and edge runtimes for now; Bun may come later.

## D-39: Sessions are opaque tokens stored in the database

Choice: the `auth` plugin issues opaque session tokens stored in the database,
so they can be revoked. A client sends one as a `Bearer` header or an httpOnly
cookie; the format is the same. The cookie is `SameSite=Lax`, and the GraphQL
transport refuses requests that are not JSON, which together block cross-site
request forgery without a CSRF token.
Why: revocation needs server state; the cookie keeps browsers safe by default
while mobile and server clients keep a plain header.
Rejected: JWT sessions (cannot be revoked before they expire).

## D-40: Applications are tested with `@ultimabase/testing`

Choice: `@ultimabase/testing` provides `testApplication(app)`, which starts
the application on a fresh `memory()` database for each test, conformance
suites for plugin and adapter authors (D-02), and PostgreSQL tests through
Docker or `TEST_DATABASE_URL`. Server-side tests use `as: master` (D-19).
Since one application runs per JavaScript realm (D-18), tests inside one file
run one after another; test files run in parallel in separate workers.
Why: the previous base proved these helpers useful; the in-memory database
keeps application tests fast.
Rejected: leaving every application to build its own test setup.

## D-41: Generated GraphQL follows GraphQL conventions

Choice: operations are named the GraphQL way (`post`, `posts`, `createPost`,
`updatePost`, `deletePost`), with plurals computed and overridable per model;
arguments follow the query API (`where`, `orderBy`, `data`, D-20). Lists use
Relay connections by default, or plain lists with
`graphql({ pagination: 'list' })`.
Why: GraphQL clients and tools (Apollo, Relay) expect these names; Relay is the
maintainer's daily usage, while some applications want plain lists.
Rejected: Prisma-style names (`findManyPost`), which keep one vocabulary but
read oddly to front-end developers.

## D-42: One `.with` key per owner

Choice: in `.with({ ... })`, on a model or a field, the kernel and each plugin
own exactly one key, named after them (`access`, `hooks`, `graphql`,
`rest`). A plugin with a single option takes the value directly
(`access: allow.public`, `rest: false`); one with several takes an object. The
same rule holds for plugin keys in `defineModel` (`softDelete: true`). Two
plugins claiming the same key stop startup with a message naming both.
Why: no collision between independent plugins (D-21); autocompletion lists
one key per installed plugin; a key leads to its plugin in one click; opening a
model stays one word (D-04).
Rejected: every option flat at the root (mixed keys, collisions, unclear
owner); a mandatory object per plugin (`access: { rule: allow.public }`).

## D-43: Applications write hooks under `hooks`

Choice: an application writes the D-15 hooks on its model, under the kernel's
`hooks` key. Queries inside an in-transaction hook join the transaction
(D-36). Hooks are for behaviour; permissions belong to `access` rules (D-44).
Why: the hooks Parse developers use every day, with the same names, and no
second concept beside the plugin hooks.
Rejected: a separate hooks plugin; Parse's global `beforeSave('Post', ...)`
registration, far from the model.
Example:

```ts
export const User = defineModel({ name: 'User', fields }).with({
	access: allow.public,
	hooks: {
		afterCreate: async ({ record }) => {
			await Profile.create(
				{ data: { user: { connect: { id: record.id } } } },
				{ as: master },
			)
		},
		afterCreateCommit: async ({ record }) => sendWelcomeEmail(record.email),
	},
})
```

## D-44: Field access rules per operation

Choice: a field's `.with({ access })` takes one rule or one rule per operation
(`read`, `create`, `update`). A rule has the shape of D-10: it receives the
caller and, for writes, the new value, and returns `true`, `false` or a
`where`. A read `where` decides, row by row, whether the field's value is
returned; an update `where` names the rows whose field may change (`{ status:
'draft' }`: only while the stored status is still draft). An unreadable field
is left out of results; a field nobody but Master may read is absent from the
generated GraphQL type, and one readable under a condition is nullable there.
Filtering or sorting on a field is refused when its read rule returns
`false`, and narrowed by its `where` otherwise. A refused write fails with
`ACCESS_DENIED` and the field's path.
Why: Parse puts protected fields and per-field write checks in `beforeSave`
code, which grows into spaghetti; a rule next to its field reads at a glance.
A filter on a hidden field would leak its value one guess at a time; ANDing
the read `where` into the filter (`isSelf` returns `{ id: caller.user.id }`)
lets a caller filter on their own email and nobody else's.
Rejected: per-field checks in hooks; a model-level map of protected fields.
Open: the rule shape follows the open point of D-10; the `where` wording
above is a draft until it is decided.
Example:

```ts
fields: {
	email: string().with({ access: { read: isSelf, update: isSelf } }),
	status: enumOf(['draft', 'published']).with({
		access: {
			update: anyOf(({ value }) => value === 'draft', hasRole('editor')),
		},
	}),
	createdBy: one(() => User).with({
		access: { create: allow.private, update: allow.private },
	}),
}
```

## D-45: Function types become GraphQL types, with an escape hatch

Choice: a function's `input` is any Standard Schema; its `output` is a model
(`Todo`), a list (`[Todo]`), a paginated list (`paginated(Todo)`, shaped by the
application's pagination, a Relay connection by default, D-41), an object
mixing models and schemas (`{ todo: Todo, created: z.boolean() }`) or any
Standard Schema. GraphQL types come from the validator's standard JSON Schema
export: a nested object is named from its path (`CreateOrderInputAddress`); a
schema given an id (Zod's `.meta({ id: 'Address' })`) becomes one shared type;
two different shapes under one name stop startup; a validator without a JSON
Schema export stops startup naming the function. What a validator cannot
describe (arguments on output fields, interfaces, per-field resolvers) is
added by extending the generated GraphQL schema by hand (`graphql-js`, Nexus or
any tool producing it); the documentation states this path.
Why: one declaration covers the common custom query or mutation without
writing GraphQL types; rare GraphQL-only features stay possible, as raw Hono
routes do for HTTP (D-27).
Rejected: a GraphQL type builder in UltimaBase (re-creating Nexus); output
limited to models.

## D-46: An adapter runs a whole query in one round trip

Choice: the kernel hands the adapter the whole operation (nested `include`,
`select`, relation filters, access filters) and the adapter runs it in one
round trip: lateral subqueries aggregated as JSON on PostgreSQL,
`JSON_ARRAYAGG` on MySQL, one `$lookup` pipeline on MongoDB. The contract
suite (D-02) counts statements: a `findMany` with three levels of `include`
runs exactly one. A filter through a relation (`posts: { some: { ... } }`)
applies the target model's access rules, as D-44 does for fields.
Why: N+1 queries are prevented by the contract, not by care in each adapter,
and a test catches any regression; a relation filter ignoring the target's
access would reveal rows the caller cannot read (met in the previous base).
Rejected: fetching relations one query per parent; batching loaders as the
main defence.

## D-47: SQL adapters build queries with Kysely

Choice: the PostgreSQL adapter, and later MySQL, build SQL with Kysely, a
schema-less query builder; one internal relation compiler, shared by the SQL
adapters, produces the single query of D-46. Kysely never appears in public
code. PostgreSQL starts on the `pg` driver.
Why: the previous base generated Drizzle tables and relations from its models
at startup, kept three representations in sync, injected access filters
through raw SQL and depended on a release candidate; its PostgreSQL plugin
reached 9,500 lines. Kysely needs nothing generated, shares one query API
across PostgreSQL, MySQL and SQLite, and provides the JSON helpers the single
query needs. Builder overhead is negligible next to a database round trip.
Rejected: Drizzle (built for hand-written static schemas, one table builder per
database); a hand-written SQL compiler (escaping and dialects for no speed
gain).

## D-48: Writes apply rules and hooks per row, in at most two statements

Choice: every write, single or bulk (`updateMany`, `deleteMany`), applies
hooks and access rules to each affected row; no API or option skips them.
Hooks run for every caller; access rules for every caller but Master. The
kernel sends at most two SQL statements per write, BEGIN and COMMIT aside and
queries made by hooks excluded: one `SELECT ... FOR UPDATE` loading every
affected row once, when a `before*` hook or an access rule needs the stored
record, then one write statement (with `RETURNING`, through a CTE when
`after*` hooks need the previous values). Without such hooks or rules, the
write is a single statement. The contract suite counts statements (D-46).
Why: a bulk write that skips per-row logic lets data bypass the rules; each
extra round trip costs latency on every write.
Rejected: bulk writes that skip hooks or rules; one statement per row.
Open: nested relation writes (`create` with `connect` or a nested `create`):
one statement per relation, or still two in total through data-modifying
CTEs.

## D-49: A master key lets transports act as Master, outside production

Choice: `UltimaBase.create({ masterKey: process.env.ULTIMABASE_MASTER_KEY })`
declares an optional master key. A transport receiving it (the
`x-ultimabase-master-key` header over HTTP) runs the request as Master, with
`caller.master.source === 'key'` (D-19). The comparison is constant-time and
every use is logged. Without a configured key, a request carrying one is
refused. When `NODE_ENV === 'production'`, the key is refused even if set,
unless the developer writes `masterKey: { key, production: true }`.
Why: front-end end-to-end tests seed their data through the API with the key,
then test the interface; a key copied into production by mistake must not
open the database.
Rejected: the key as an option of the HTTP plugin (the previous base), since
Master belongs to the kernel and every transport reads it; a key enabled
without configuration.

## D-50: PostgreSQL 15 and later, newer features when present

Choice: the PostgreSQL adapter supports version 15 and later and stops startup
below it. It reads the server version at startup and uses newer features when
present (on PostgreSQL 18, `RETURNING old` and `new`), with the same results on
every version. The contract suite runs on the oldest and the newest supported
versions.
Why: 15 is the oldest version still maintained for the first release (14 ends
in November 2026); a developer on 18 gets its gains by connecting to it, with
no option to set.
Rejected: requiring 18, which many hosted databases do not offer yet; an
option naming the version.

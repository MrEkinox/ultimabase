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
required `database` option beside the `plugins` list, in the one options object
of `defineApp` that holds the rest of the application's configuration (D-24,
D-49, D-58). The in-memory adapter ships with the kernel and is imported like
any other (`memory()`); PostgreSQL is a separate package. Adapters implement
one public contract, and one shared contract suite runs against each of them
(transactions included). The contract is D-73.
Why: storage is mandatory and unique, unlike plugins, which are optional and
combinable; a dedicated slot makes both rules structural instead of runtime
checks. Naming the in-memory adapter keeps a first application and the test
suite free of Docker while making it obvious that data disappears on restart.
Rejected: storage as a plugin (the previous design), which needed checks for
"none" and "two"; an implicit in-memory default, which lets a forgotten option
run production on memory; plugins chained with `.use(...)`, the one call
outside the options object, which left open whether two calls add up.
Example:

```ts
export const app = defineApp({
	database: postgres(),
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Post, User],
})
export const demo = defineApp({ database: memory(), models: [Post, User] })
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
everything that shapes the model: its fields and the plugins it uses, whose
entries' options add fields or storage (soft delete, D-24). It is followed by `.with({ ... })`, which
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
`update`, D-44), and a specific key wins over `write`. Every rule receives
`{ caller, operation }`, so one `write` function can handle every write by
testing `operation`. A write rule also receives the stored `record` (on
`update` and `delete`) and the new `value` (on `create` and `update`), and
returns `true` or `false`. A read rule on a model cannot see the record: it
returns `true`, `false` or a filter built by the `where` it receives,
`where({ ... })` in Prisma's form (D-20), which the kernel ANDs into the
query. `where` returns an opaque filter, so a plain object is refused.
Why: DX is UltimaBase's first goal. One concept instead of words plus
functions; a developer jumps to a rule's source to see what it does; rules
compose; plugins add rules without a typed registry of words. The previous
five-key object, modelled on Keystone, was verbose for the common cases.
`record.status === 'draft'` is the clearest write condition. A read filter
keeps pagination, `count` and relation filters exact and runs in the same
round trip (D-46). TypeScript checks an argument for unknown keys but never
an object a function returns, and `.with` cannot be generic without a cycle
(D-24): written `where({ ... })`, a misspelled key next to a valid one fails on
its line at any depth, where a returned `{ where: { ... } }` compiled and
reached the kernel.
Rejected: string words (`'public'`), whose meaning hides inside the access
implementation; a per-operation object as the only form; read rules run on
each loaded row, which shorten pages, falsify `count` and cannot run inside a
relation filter (`posts: { some: ... }`) without leaking or a second query;
returning `{ where: { ... } }`, never checked for unknown keys; an annotated
return type on each rule, which names the model's type and is easy to forget.
Example:

```ts
.with({ access: allow.public })
.with({ access: { read: allow.public, write: isAuthenticated } })
.with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ archived: false }),
		update: ({ record }) => record.status === 'draft',
		write: ({ operation, caller }) =>
			operation === 'delete'
				? caller.kind === 'master'
				: caller.kind === 'user',
	},
})

// Before: compiles, and the kernel receives an unknown `statuss` condition
read: () => ({ where: { archived: false, statuss: 'published' } }),
// After: fails on `statuss`, "Did you mean to write 'status'?"
read: ({ where }) => where({ archived: false, statuss: 'published' }),
```

## D-11: No type generation

Choice: every type comes from TypeScript inference on the code the developer
writes. No generator, no generated file, no build step for types.
Why: type generation is a major flaw of other backend frameworks: an extra
command, files out of sync with the code, slower feedback.
Rejected: any form of typegen, even optional.

## D-12: The same `(data).with(plugins)` shape for models and fields

Choice: `defineModel`'s `fields` is a callback, `fields: (f) => ({ ... })`,
its only form; it receives the field builders, which `ultimabase` does not
export. A builder's options describe the data (`f.string({ optional: true })`);
an optional `.with({ ... })` on the field holds the rules for that field: the
kernel's `access` (D-44) and, under its name, the field rule of each plugin in
the model's `use` (`fieldWith`, D-57), typed by the field's value. Without the
plugin in `use`, its key fails on its line. A rule sits next to the object it
governs. As for models (D-07), what shapes the field goes in its options and
what acts on it goes in `.with`.
Why: one rule to learn at both levels; no rules map keyed by field names far
from the fields. The callback is how the builders learn the model's `use`,
with no import, registry or helper. As the only form it is one thing to learn,
and a declared record's error (D-44) stays on the field's line: offered next
to an object form, the error moved to `fields`.
Condition: accepted once a benchmark on a large model shows editor typing
cost no worse than the previous base's field form on TypeScript 7. If it
fails, this entry is replaced. Met on 2026-10-19 by the Phase 1 prototype,
with and without field rules, 120 more fields on one model; measured again on
2026-10-20 with the callback and plugin field rules: 16 % more instantiations
and about 7 % more check time than imported builders on 200 models, 0.52 s
against the previous base's 4.2 s (`bench/typing/README.md`).
Rejected: plugin options inside field options (mixes data and behaviour); a
per-field rules map in the model's `.with` (rules far from their fields);
imported builders taking `access` only (a plugin's field rule could not be
typed); imported builders next to the callback (two forms, and the error
leaves the field's line); a registry of the plugins (global, D-24); a helper
binding the builders to a `use` (one more import and line per model).
Example:

```ts
// Before
import { boolean, defineModel, one, string } from 'ultimabase'
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

// After
import { defineModel } from 'ultimabase'
export const Todo = defineModel({
	name: 'Todo',
	use: [acl()],
	fields: (f) => ({
		title: f.string({ validate: z.string().trim() }).with({
			access: { update: isAuthenticated },
			acl: { roles: ['editor'] },
		}),
		done: f.boolean({ default: false }),
		assignee: f.one(() => User, { optional: true }),
	}),
}).with({ access: allow.public })
```

## D-13: Plugins with a model of their own add a `define<Kind>` entry

Choice: a plugin that needs a specific kind of model exports its own entry,
named `define<Kind>` (roles: `defineRole`), which builds an ordinary model
through the kernel's `defineModel`, with the plugin in its `use` (D-24).
An application may have several role models, each with its own custom
fields.
Why: the kind of a model is visible from its first word, while the kernel
keeps one model entry and knows no plugin.
Rejected: a `RoleModel.define` entry in the kernel; a `role` key inside
`defineModel`, easy to miss in a long declaration.
Example:

```ts
export const TeamRole = defineRole({
	name: 'TeamRole',
	members: () => User,
	fields: (f) => ({ color: f.string({ optional: true }) }),
})
```

Typing (2026-10-20): the kernel exports `ModelFields<F, U>` and
`ModelOf<N, F, U>`, the types of `defineModel`'s `fields` callback and of the
model it returns. A `define<Kind>` declares its signature with them and puts
its own entry first in `U`. The model it returns then lists the plugin, so
`defineApp` asks for the plugin's application value, and its `.with` holds the
keys of every plugin in its `use`. The plugin does not have to export the
entry its `define<Kind>` adds; auth does not, so `defineUser` is the only way
to declare a user model. Typing the body of a `define<Kind>` needs an
assertion when `use` is omitted, which Oxlint refuses
(`no-unsafe-type-assertion`). How the plugin's code builds its `use` is
settled when auth is written (Phase 5).
Why: a plugin's signature reads like `defineModel`'s and follows it when it
changes.
Rejected: instantiation expressions
(`ReturnType<typeof defineModel<N, F, U>>`). They compile, but every plugin
depends on the order of `defineModel`'s type parameters, and the signature
is hard to read.
Example:

```ts
// Before: a plugin repeats defineModel's signature through instantiation expressions
readonly fields: Parameters<typeof defineModel<N, F, WithAuth<U>>>[0]['fields']
}): ReturnType<typeof defineModel<N, F, WithAuth<U>>>

// After: auth's defineUser
type WithAuth<U extends Uses> = readonly [ModelUse<'auth', Auth>, ...U]
export declare function defineUser<
	const N extends string,
	const F extends FieldShapes,
	const U extends Uses = [],
>(definition: {
	readonly name: N
	readonly use?: U
	readonly fields: ModelFields<F, WithAuth<U>>
}): ModelOf<N, F, WithAuth<U>>
```

## D-14: Functions over magic words

Choice: when a value carries behaviour, the API takes a function or an
imported value rather than a string keyword.
Why: a developer can jump to a function's source and read what it does; a
keyword's meaning is hidden inside the code that interprets it.
Rejected: string keywords for behaviour.

## D-15: A plugin adds features, commands and hooks

Choice: a plugin contributes features to the models that use it (fields,
tables, D-24), commands (new operations on a model, such as `restore`) and
hooks. Hooks are few
and fixed, and an application writes the same ones (D-43). On an operation, in
this order:

1. `redirect` (plugins only): replace the operation with another one (soft
   delete turns `delete` into `update`). The replacement runs through the
   whole pipeline.
2. `beforeFind`, `beforeCreate`, `beforeUpdate`, `beforeDelete`: refuse the
   operation, add a filter that only narrows, never widens (access, ACL), or
   change the input data (trim, computed field).
3. `afterCreate`, `afterUpdate`, `afterDelete`: run inside the operation's
   transaction, after its write, and write more (create a user's profile
   when the user is created). A failure rolls everything back.
4. `afterCreateCommit`, `afterUpdateCommit`, `afterDeleteCommit`: run after
   commit (email, webhook, cache). A failure is logged with a correlation id
   (D-28) and the operation still succeeds, since its write is committed;
   retries belong to a jobs plugin.

What each hook receives and returns is D-71; there is no `afterFind`. The
names follow Parse (`beforeSave`) and Rails (`after_create_commit`). Plugins
alone also have application hooks: Identify (per request, before any
operation: the identity plugin, such as auth, fills `caller.user`, and another
plugin adds its own key, such as `caller.tenant`, D-19) and Start/Stop
(connect, listen, seed). Applications do not write these.
Why: the previous runtime had about eighteen stages; each hook here is needed
by the kernel's access rules (D-10) or by a real plugin of the previous base
(ACL, roles, soft delete, auth, Postgres, HTTP) and has one nameable purpose.
Guards: at most one plugin may redirect a given operation on a given model,
two plugins may not add a command of the same name to one model, and only one
plugin may fill `caller.user`; each conflict stops startup with a message
naming both plugins. This design is
accepted once the kernel's access rules, soft delete and an after-commit email
plugin are written with it, soft delete in under 150 lines (383 before).
Rejected: a hook per pipeline stage; a generic interceptor around everything.

## D-16: Plugins call each other directly

Choice: a plugin that needs another declares it by its plugin value
(`requires: { auth: authPlugin }`, D-57) and calls its public API,
`plugins.auth`. `defineApp` fails typing, and startup fails, naming the
missing plugin, when a requirement is not installed. A plugin that can work
without another lists it in `optional: { roles: rolesPlugin }` and gets
`plugins.roles`, possibly `undefined`; it reports a clear error,
and types its options accordingly, when a feature needs the absent plugin (an
ACL entry naming a role without `rolesPlugin()` installed). The kernel has no
service registry and no event bus between plugins. HTTP routes belong to the
HTTP plugin (`httpPlugin()`), which owns the server (port, CORS, Hono routes); GraphQL and
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
`'anonymous'`, `'user'` or `'master'`; `caller.user` is set for a user
(its type, D-62),
`caller.master` (`{ source: 'code' | 'key' }`) for Master; plugins add their
own keys through Identify (`caller.tenant`). `{ as: caller }` runs with
whatever the caller is, Master included when the request came with the master
key (D-49), so hooks and routes never import `master`; server code without a
request (scripts, jobs) does. Without `as`, the operation runs as anonymous.
Only the kernel creates `master`. `caller` is a union discriminated by
`kind`: `caller.user` exists only when `kind` is `'user'` and `caller.master`
only when it is `'master'`, so code tests `kind` before reading them and
`caller.user?.id` is a type error. A `where` keeps Prisma's meaning of
`undefined`, no condition (D-20).
Why: Parse splits this between `useMasterKey` and `sessionToken`, which can be
passed together with an unclear priority. One option holds one caller, a
condition is a ternary, and a forgotten `as` fails closed (D-04) instead of
leaking. With an optional `caller.user`, the read filter
`{ author: { is: { id: caller.user?.id } } }` compiled and, for an anonymous
caller, meant "any author": it leaked every draft (sample application,
2026-10-20). The union makes that line fail to compile.
Rejected: a `useMasterKey` boolean; separate master and session options; an
optional `caller.user` on every caller; refusing `undefined` in a `where`,
which departs from Prisma and still leaves the mistake to runtime.
Example:

```ts
Post.findMany({ where }, { as: fromBackOffice ? master : caller })

// Before: compiles, and shows every author's drafts to an anonymous caller
read: ({ caller, where }) =>
	where({
		OR: [{ status: 'published' }, { author: { is: { id: caller.user?.id } } }],
	})
// After
read: ({ caller, where }) =>
	where(
		caller.kind === 'user'
			? {
					OR: [
						{ status: 'published' },
						{ author: { is: { id: caller.user.id } } },
					],
				}
			: { status: 'published' },
	)
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
The first release ships the subset needed by its examples and its GraphQL
(D-41); the rest follows Prisma's spelling when added. That subset is
`findUnique`, `findFirst`, `findMany`, `count`, `create`, `update` and
`delete`, with `where` (scalar filters, `is`/`isNot`, `some`/`every`/`none`,
`AND`/`OR`/`NOT`), `select`, `include`, `orderBy`, `take`, `skip` and
`cursor`, and relation writes by id: `connect` on a `one` and a `many`
relation, `disconnect: true` to unset an optional `one` relation (`null` is
refused, as in Prisma), `disconnect: [{ id }]` on a `many` relation in
`update`. A `cursor` is a unique target (D-52) and also pages a nested list,
which a Relay connection needs. Like Prisma, the kernel refuses at run time any
argument key it does not know, at any depth, in the caller's arguments and in
the filters that rules and hooks add, with the `INVALID_QUERY` code and the
key's path; keys a plugin adds to an operation are known keys. The error is
not public (D-28): a wrong key is a bug of the server code, written to the
log; a transport that passes client input checks it against its own schema
first.
Why: Prisma's query API is the best-known in TypeScript and many frameworks
copied it; familiarity is free DX. Types do not reach JavaScript callers,
casts or values built at run time, and an ignored filter key widens a query:
on a read filter it leaks rows (D-04).
Later: Prisma's fluent relation API (`Post.findUnique(...).author()`), once it
can run without an extra query per parent (no N+1). After the first release:
`upsert` and the batch operations `createMany`, `updateMany` and
`deleteMany`, once it is decided which rules and hooks they run (create's or
update's for `upsert`, per row or per batch, and the soft-delete trash);
`omit`, which `select` covers meanwhile; nested creation (`create` in a
relation write), which ships before 1.0; `set`, `distinct` and aggregates;
case-insensitive filters (`mode: 'insensitive'`), left to a search plugin
first.
Rejected: a query syntax of our own; a function builder for `where` beside
the object form; ignoring unknown keys, which turns a typo into a wider read.
Example:

```ts
// A key the types did not see: JavaScript, a cast, a value built at run time
await Post.findMany({ where: { status: 'published', titel: 'x' } })
// Before: `titel` ignored, every published post returned
// After: throws INVALID_QUERY, unknown key `where.titel` on Post
```

```ts
// Before (the prototype): an optional relation unset with `null`, no way
// to take one tag off a post, no cursor
await Post.update({ where: { id }, data: { reviewer: null } })
// After (0.1): Prisma's spelling
await Post.update({ where: { id }, data: { reviewer: { disconnect: true } } })
await Post.update({
	where: { id },
	data: { tags: { disconnect: [{ id: t }] } },
})
const page = await Post.findMany({ cursor: { id: last }, skip: 1, take: 20 })
const latest = await Post.findFirst({ orderBy: { createdAt: 'desc' } })
```

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
trusted server code. Whether a required field is present is checked later, at
the write (D-67), so a hook can fill it. Validation is part of the kernel.
Validation errors carry the field path.
Typing (2026-10-20): on a scalar, the builder gives the type. The schema's
input must accept every value of the field and its output must be of the
field's type: `z.string().email()` fits `f.string()`, `z.enum(['a', 'b'])`
is refused there (`f.enumOf` says it), and so are a schema typed `any` and
one that declares no types. The function form takes the field's value and
returns the value to store, sync or async; it throws to refuse. Field rules,
the model's and the plugins' (D-12, D-44, D-57), judge what the caller sent
(D-67), so they see the schema's input; records hold its output.
Why: developers already know their validation library; the previous base's
validation worked well. A schema narrower than its field would make the
field's type lie about what reaches the database.
Rejected: a validation language of our own; a schema narrowing a scalar's
type, which `f.enumOf` and `f.json` already cover.
Example:

```ts
name: f.string({ validate: z.string().trim().min(1) }),
slug: f.string({ validate: (value) => value.toLowerCase() }),
// Refused on its line: the schema must accept every value of the field
kind: f.string({ validate: z.enum(['a', 'b']) }),
```

## D-24: Models list the plugins they use; `defineApp` assembles the application

Choice: `defineModel` and `defineFunction` (D-27) are imported from
`ultimabase`. Nothing is declared from an application object or globally:
there is no `App`, and the only global declaration is the optional user model
(D-62). A model lists the plugins it uses in
`use: [...]`, each entry imported from the plugin's package (`softDelete()`,
`acl()`); an entry's options shape the model for that plugin (D-07). One file
assembles the application with `defineApp({ database, plugins, models,
functions })`, which holds every option of the application (D-02); `plugins`
takes each plugin's application value (`softDeletePlugin()`, D-35) with the
options that apply to the whole application; both values come from the
plugin's `definePlugin` (D-57). Each plugin decides where it
acts: one that changes a model (soft delete) acts only on the models that list
it; one that acts on every model (ACL, transports) does so whether a model
lists it or not, and its entry only gives that model its options, so
forgetting an entry never removes a protection (D-04). A model's `.with` keys
(D-42) and commands (D-15) are exactly those of the plugins in its `use`: a
key of a plugin outside it fails on its own line. The `defineApp` line fails
typing when a model uses a plugin missing from `plugins`, when a relation's
target is missing from `models`, or when an `inverse` names no field of its
target (D-37); startup stops with a message for each, for JavaScript and
casts. `defineModel` and `defineFunction` register nothing; `migrate` (D-26)
and tests (D-40) import the application without starting it.
Why: nothing implicit. One file configures the whole application, and each
model says which plugins act on it: a reader sees a model's behaviour in its
file, and no key appears because a plugin is installed elsewhere. A model is a
plain value that imports only what it uses, with no application object to
declare before it. Relation cycles are avoided by thunks read lazily and
callbacks in the final non-generic `.with`. Measured on 2026-10-20
(`bench/typing/README.md`): typing cost within 0 % to 10 % of the previous
`App.defineModel` form, at most 50 ms more on the `defineApp` line of 200
models, which also checks the plugins and the relation targets.
Rejected: `App.defineModel` from `UltimaBase.create({ database, plugins })`
and `App.build({ models })` (the configuration split over two calls, every
installed plugin's keys on every model, each model importing an application
declared before it); one plugin value shared by `plugins` and `use` (the
application's options and a model's options differ); `use` as the only switch
of every plugin (a model forgetting `acl()` would lose its ACL filter
silently); a generic `.with` taking the plugins (relation rings cycle,
TS7022); a project-wide `Register` of plugins or models, which the previous base needed
for its name-keyed types and which caused its own cycles (its ADR-0297 and
ADR-0335); each plugin adding its keys to global interfaces (accepts the keys
of any plugin whose types are loaded); type generation (D-11).
Example:

```ts
// Before
// app.ts
export const App = UltimaBase.create({
	database: postgres(),
	plugins: [softDelete(), acl(), graphql()],
})
// post.ts
import { App } from './app.ts'
export const Post = App.defineModel({ name: 'Post', softDelete: true, fields })
// server.ts
export const app = App.build({ models: [Post, User], functions: [archive] })

// After
// post.ts
import { defineModel } from 'ultimabase'
import { acl } from '@ultimabase/acl'
import { softDelete } from '@ultimabase/soft-delete'
export const Post = defineModel({
	name: 'Post',
	use: [softDelete(), acl()],
	fields,
}).with({ access: allow.public, acl: { ownerField: 'author' } })
// app.ts
export const app = defineApp({
	database: postgres(),
	plugins: [softDeletePlugin(), aclPlugin(), graphqlPlugin()],
	models: [Post, User],
	functions: [archive],
})
// server.ts
await app.start()
```

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

Choice: `defineFunction({ name, use, input, output, run })` declares a server
operation with a Standard Schema input and a typed output (D-45 lists the
accepted outputs). Every installed transport exposes it (a GraphQL query or
mutation, a REST endpoint); `.with({ ... })` sets its access, closed by
default (D-04), and where it is exposed (`.with({ rest: false })`, for a
transport listed in its `use`, as on a model, D-24). `run`
receives the validated input and the caller. For anything else (webhooks,
redirects) the HTTP plugin is built on Hono and the developer writes plain Hono
routes with the caller available. A function reaches the application through
`defineApp({ functions: [...] })` (D-24), like models, which refuses a
function whose `use` lists a plugin missing from `plugins`.
Typing (2026-10-20): `input` is optional; without it, `run` receives no
`input`, and an input schema typed `any` or without types is refused (D-23).
`run` returns the output's type (D-45), which is not validated at run time:
like hooks, a function is trusted server code (D-23). A transport keys a
function's `.with` through `functionWith` in its types (D-57), the way
`with` keys a model's; the graphql and REST plugins type it
`{ name?: string } | false`, and `false` hides the function from that
transport. A plugin without `functionWith` is refused in a function's `use`,
where it would do nothing. The access rule receives `{ caller }` only: it runs
before the input is validated, so a closed function reveals nothing of its
input; a check that needs the input throws from `run`. `allow.public` and
`allow.private` fit it; `allow.readOnly`, which reads the operation, does not.
Why: one declaration replaces one custom endpoint per transport, like Parse
Cloud Functions; GraphQL needs a runtime output type, which the output schema
gives. Hono routes need no new concept. Validating the output would cost every
call to catch what the types already catch.
Rejected: a `defineRoute` wrapper around HTTP; functions per transport;
validating the output at run time; an access rule that reads the input.
Example (before, the decision's first form; after, as typed):

```ts
// Before: `rest: false` was untyped, and `run`'s return was not checked
export const archiveTodo = defineFunction({
	name: 'archiveTodo',
	use: [rest()],
	input: z.object({ id: z.string() }),
	output: Todo,
	run: ({ input, caller }) =>
		Todo.update(
			{ where: { id: input.id }, data: { archived: true } },
			{ as: caller },
		),
}).with({ access: isAuthenticated, rest: false })

// After: the same declaration; each line below is refused on its own
export const openTodos = defineFunction({
	name: 'openTodos',
	output: [Todo],
	run: ({ caller }) => Todo.findMany({ where: { archived: false } }, { as: caller }),
}).with({ access: allow.public })

run: ({ input }) => input, // no `input` without an input schema
run: () => ({ title: 'a' }), // `output: Todo` returns a Todo record
use: [softDelete()], // soft delete has no key on a function
.with({ graphql: false }), // graphql is not in the function's `use`
.with({ access: allow.readOnly }), // a function has no operation
```

## D-28: Errors are hidden unless public

Choice: only a `PublicError` reaches clients; every other error is masked as
an internal error that carries a correlation id, also written to the server
log. Kernel errors have stable, typed codes (`ACCESS_DENIED`, `NOT_FOUND`,
`VALIDATION_FAILED`…); validation errors list the failing field paths.
Transports map codes to their own conventions (HTTP status, GraphQL
extensions). The API and the codes are D-72.
Why: masking by default keeps internals private; the previous masked errors
left no trace to debug from.
Rejected: exposing error messages by default.

## D-29: Plugin order matters only where it must

Choice: hooks run in the fixed order of D-15. Filters and refusals from
`before` hooks combine with AND, so plugin order cannot change them. Data
changes and `after` hooks run in the order of `plugins`, plugins first, then
the application's own hooks.
Why: security never depends on the order plugins were written in.
Rejected: explicit priorities.

## D-30: Package names

Choice: `ultimabase` holds the kernel and the in-memory adapter; official
plugins are `@ultimabase/<name>` (`postgres`, `graphql`, `rest`, `auth`…).
A plugin is official when the UltimaBase team writes and maintains it;
community plugins are named `ultimabase-plugin-<name>` and carry the
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
no files. A plugin's field type is imported from its package and needs no
`use` entry; `defineApp` fails when its plugin is not in `plugins`, and its
`.with` takes `access` only (D-57).
Why: new field types brought by plugins are a core promise of UltimaBase.
Example:

```ts
export const Post = defineModel({
	name: 'Post',
	fields: () => ({ cover: file({ optional: true }) }),
})
export const app = defineApp({
	database: postgres(),
	plugins: [filesPlugin({ storage: s3({ bucket }) })],
	models: [Post],
})
```

## D-33: Sign-in methods combine on one user

Choice: the `auth` plugin owns users, sessions and Identify; each sign-in
method is a plugin that requires it (`passwordPlugin()`, `magicLinkPlugin()`,
`oauthPlugin({ google, github })`). One user may have several linked methods (email
and password plus Google), and a user can link or unlink a method.
Why: most applications offer more than one way to sign in to the same account.
Rejected: one plugin per method, each with its own users.

## D-34: GraphQL is the first transport

Choice: the first release ships the GraphQL transport, generated from the
models and functions; REST follows. It runs on `graphql-http`, the reference
implementation, mounted on the HTTP plugin's server (D-16). Outside production it
also serves GraphiQL.
Why: one transport proves the design; GraphQL is the one the maintainer uses
daily and many users depend on. `graphql-http` is small and enough, since
the HTTP plugin already owns the server and CORS; GraphiQL is the first screen a
developer opens after `npm create ultimabase` (D-61).
Rejected: GraphQL Yoga, whose extras (subscriptions, Envelop plugins) wait for
realtime (D-25); two GraphQL servers to choose from (the previous base).

## D-35: Public names follow one convention

Choice: a declaration the developer writes is `define<Thing>`, named after
UltimaBase's own noun (`defineModel`, `defineFunction`, `defineApp`, and a
plugin's `defineRole`); the declared thing is named by a `name` key everywhere.
Something plugged in or configured is a plain noun call: an adapter
(`postgres()`, `s3()`), a field type (`f.string()`, `file()`), a plugin's entry
in a model's `use` (`softDelete()`, D-24). A plugin's value for the `plugins`
of `defineApp` adds `Plugin` (`softDeletePlugin()`, `filesPlugin()`), every
plugin alike, whether or not it has a `use` entry.
Ready-made access rules live under `allow`. A data declaration is a model,
never a schema, in the API, errors and documentation.
Why: one bare `define` beside `defineRole` and `defineFunction` read as an
accident; the `use` entry is written in every model that needs it and the
application value once, so the short name goes to the entry; "model" matches Prisma (D-20), while "schema" already means
Standard Schema validators (D-23), the GraphQL schema (D-34) and Postgres
schemas.
Rejected: a bare `define`; `defineSchema`; `defineCollection` (suggests a
document store); Parse's `className`.
Example:

```ts
export const Todo = defineModel({
	name: 'Todo',
	fields: (f) => ({ title: f.string() }),
})
export const TeamRole = defineRole({
	name: 'TeamRole',
	members: () => User,
})
export const archiveTodo = defineFunction({
	name: 'archiveTodo',
	input,
	output,
	run,
})
```

## D-36: Hooks share the operation's transaction; functions open their own

Choice: queries made inside an in-transaction hook join that transaction
without a `tx` argument (Node's `AsyncLocalStorage`). A function (D-27)
runs without a transaction; the developer opens one explicitly with `await
transaction(async () => { ... })`. A single operation, with its in-transaction
hooks, is always atomic. When the callback throws, every write made inside it,
hooks' writes included, is rolled back and `transaction` rejects with that
error; the `*Commit` hooks (D-15) of those writes run only once the
transaction commits, and never after a rollback. A query that fails inside a
transaction rolls all of it back even when the callback catches the error, as
PostgreSQL does, and `transaction` rejects with that error. A `transaction`
called inside another joins the outer one: no savepoint.
Why: a forgotten `tx` silently writes outside the transaction; a function
often calls external services (payments, email), and holding a transaction
open across a network call locks rows and sends effects before a rollback.
Rejected: passing `tx` by hand; a transaction around every function; a
savepoint around each query or nested `transaction`, slower and harder to
reason about.

## D-37: Relations are `one` and `many`, declared on both sides

Choice: a relation field is `f.one(() => Target)` or `f.many(() => Target)`, and
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
	fields: (f) => ({ author: f.one(() => User), tags: f.many(() => Tag) }),
})
export const User = defineUser({
	name: 'User',
	fields: (f) => ({ posts: f.many(() => Post) }),
})
export const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ posts: f.many(() => Post) }),
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
Docker or `TEST_DATABASE_URL`. Server-side tests use `as: master` (D-19),
or `asUser(user)` to test access rules (D-80, amended 2026-10-21).
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
`graphqlPlugin({ pagination: 'list' })`.
Why: GraphQL clients and tools (Apollo, Relay) expect these names; Relay is the
maintainer's daily usage, while some applications want plain lists.
Rejected: Prisma-style names (`findManyPost`), which keep one vocabulary but
read oddly to front-end developers.

## D-42: One `.with` key per owner

Choice: in `.with({ ... })`, on a model or a field, the kernel and each plugin
own exactly one key, named after them (`access`, `hooks`, `graphql`,
`rest`). A plugin with a single option takes the value directly
(`access: allow.public`, `rest: false`); one with several takes an object. A
plugin's key exists only where its entry is in `use` (D-24). Two plugins
claiming the same key stop startup with a message naming both.
Why: no collision between independent plugins (D-21); autocompletion lists
one key per plugin the model uses; a key leads to its plugin in one click; opening a
model stays one word (D-04).
Rejected: every option flat at the root (mixed keys, collisions, unclear
owner); a mandatory object per plugin (`access: { rule: allow.public }`).

## D-43: Applications write hooks under `hooks`

Choice: an application writes the D-15 hooks on its model, under the kernel's
`hooks` key. Queries inside an in-transaction hook join the transaction
(D-36). Hooks are for behaviour; permissions belong to
`access` rules (D-10, D-44).
Why: the hooks Parse developers use every day, with the same names, and no
second concept beside the plugin hooks.
Rejected: a separate hooks plugin; Parse's global `beforeSave('Post', ...)`
registration, far from the model.
Example:

```ts
export const User = defineUser({ name: 'User', fields }).with({
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
(`read`, `create`, `update`). A rule has the shape of D-10 and returns `true`
or `false`; every field rule, read included, receives the row's `record`
(none on `create`) and, for writes, the new `value`. A read rule only hides a
value, so it runs on each returned row: an unreadable field is left out of
that row. A field nobody but Master may read is absent from the generated
GraphQL type, and one readable under a condition is nullable there. A caller
other than Master cannot filter or sort on a field that has a read rule. A
refused write fails with `ACCESS_DENIED` and the field's path.
Typing: in `.with({ ... })`, `value` and `record.id` are typed, the other
fields of `record` are `unknown`, and the `boolean` result is checked. Rules
that read other fields declare only those fields, each with the model's exact
type: `.with<{ status: 'draft' | 'published' }>({ ... })` types them in
`record`, and the rules need no annotation. `defineModel` checks the
declaration against the model: a field the model does not have, or a type
that differs from the model's (wider, narrower, optional, `any`), fails on
that field's line and shows the model's type to copy, so a wider type cannot
let `'publshed'` through. An
optional field is declared with `| null`; scalar and system fields can be
declared, relations cannot. A model rule (D-10) is typed in full.
Why: Parse puts protected fields and per-field write checks in `beforeSave`
code, which grows into spaghetti; a rule next to its field reads at a glance.
A filter on a hidden field would leak its value one guess at a time, and a
rule on `record` cannot run inside the query. On TypeScript 7 the field's
`.with` call is checked while its model is still being typed, so any record
type derived from the model is a cycle (TS7022) that turns the whole
application into `any`, far from the faulty line. A declared type does not
depend on the model, so it cannot cycle; checking it in `defineModel`, where
the fields are known, keeps it from drifting. The developer writes only the
fields a rule reads. Checked in the Phase 1 prototype with rules nested in
`access`, combined with `anyOf`, and 200 models (`bench/typing/README.md`).
Rejected: per-field checks in hooks; a model-level map of protected fields,
and record-reading rules moved to the model's `.with` keyed by field (both far
from their fields); naming the model, `.with<'Post'>` with `: boolean` on each
rule (the prototype showed it cycles as soon as two rules destructure the
record or one parameter is annotated, even with a hand-written type); an
unchecked declared type (drifts from the model); a declared type allowed to
be wider than the model's (lets a misspelt enum value through); the record
type taken from a callback around the fields or from `typeof Post` (both a
cycle).
Later, if a real need appears: a field read rule may also return
`where({ ... })` (D-10), ANDed into any filter on that field, so a caller can
filter on their own email and nobody else's. It adds to this entry without
breaking it.
Example:

```ts
fields: (f) => ({
	email: f.string().with({ access: { read: isSelf, update: isSelf } }),
	status: f.enumOf(['draft', 'published']).with({
		access: {
			update: anyOf(
				({ record }) => record.status === 'draft',
				hasRole('editor'),
			),
		},
	}),
	createdBy: f
		.one(() => User)
		.with({
			access: { create: allow.private, update: allow.private },
		}),
	// Declared record: the fields the rules read, with the model's exact types
	title: f.string().with<{ status: 'draft' | 'published' }>({
		access: {
			read: ({ record, caller }) =>
				record.status === 'published' || isEditor(caller),
			update: ({ record }) => record.status === 'draft',
		},
	}),
})
```

## D-45: Function types become GraphQL types, with an escape hatch

Choice: a function's `input` is any Standard Schema; its `output` is a model
(`Todo`), a list (`[Todo]`), an object mixing models and schemas
(`{ todo: Todo, created: z.boolean() }`) or any Standard Schema. `run` returns,
respectively, the model's record, a `readonly` array of them, an object of
those types and the schema's output (D-27). A paginated output
(`paginated(Todo)`, a Relay connection) is out of 0.1 (amended 2026-10-20): a
function returns `[Todo]` and takes its pagination in its `input`. GraphQL
types come from the validator's standard JSON Schema
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
limited to models; `paginated(Todo)` in 0.1, whose connection shape depends on
the GraphQL plugin's pagination (D-41) and would tie the kernel to it.
Example:

```ts
// Before: `paginated(Todo)` was an accepted output
output: paginated(Todo),
// After: a list, paginated by the input
input: z.object({ take: z.number().int().max(100), skip: z.number().int() }),
output: [Todo],
run: ({ input, caller }) => Todo.findMany(input, { as: caller }),
// `run` returns `readonly TodoRecord[]`
```

## D-46: An adapter runs a whole query in one round trip

Choice: the kernel hands the adapter the whole operation (nested `include`,
`select`, relation filters, access filters) and the adapter runs it in one
round trip: lateral subqueries aggregated as JSON on PostgreSQL,
`JSON_ARRAYAGG` on MySQL, one `$lookup` pipeline on MongoDB. The contract
suite (D-02) counts statements: a `findMany` with three levels of `include`
runs exactly one. A filter through a relation (`posts: { some: { ... } }`)
applies the target model's read filter (D-10).
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
adapter sends at most two SQL statements per write, BEGIN and COMMIT aside and
queries made by hooks excluded: one `SELECT ... FOR UPDATE` loading every
affected row once, when a `before*` hook or an access rule needs the stored
record or a connected row, then one write statement (with `RETURNING`,
through a CTE when `after*` hooks need the previous values). Nested relation
writes (`connect`, nested `create`) join that one write statement through
data-modifying CTEs, since the kernel generates every id beforehand (D-22).
Without such hooks or rules, the write is a single statement. The contract
suite counts statements (D-46). These counts hold on PostgreSQL; other
adapters may need more (D-51).
Why: a bulk write that skips per-row logic lets data bypass the rules; each
extra round trip costs latency on every write.
Rejected: bulk writes that skip hooks or rules; one statement per row or per
nested relation.

## D-49: A master key lets transports act as Master, outside production

Choice: `defineApp({ masterKey: process.env.ULTIMABASE_MASTER_KEY })`
declares an optional master key. A transport receiving it (the
`x-ultimabase-master-key` header over HTTP) runs the request as Master, with
`caller.master.source === 'key'` (D-19). The comparison is constant-time and
every use is logged. Without a configured key, a request carrying one is
refused. When `NODE_ENV === 'production'`, the key is refused even if set,
unless the developer writes `masterKey: { key, production: true }`. An unset
key (`undefined`, in either form) leaves the master key off.
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

## D-51: PostgreSQL is the reference database

Choice: UltimaBase is designed and optimised for PostgreSQL, the database it
recommends. Other adapters (MySQL, SQLite, MongoDB) are supported later and
may do less or do it in more statements; a table in the documentation lists,
per adapter, what is supported, how many statements an operation takes and
which adapter is recommended. A design decision is never weakened to fit a
database that lacks a PostgreSQL feature.
Why: aiming at the lowest common denominator would give up single-statement
writes (D-48) and reads (D-46) on the database most users run.
Rejected: one feature set identical on every adapter.

## D-52: Unique fields on the field, indexes in `defineModel`

Choice: a field takes `unique: true` (`f.string({ unique: true })`); indexes
over one or several fields go in `defineModel`, since they shape the model
(D-07): `indexes: [{ fields: ['author', 'slug'], unique: true }]`. Every
unique field and unique index is a target of `findUnique`, `update`,
`delete` and `upsert` (D-20). A unique index is targeted flat, with exactly
its fields: `where: { author: 'u1', slug: 'hello' }`; a `one` relation in it
takes the target's id (amended 2026-10-20).
An index lists scalar fields and `one` relations only: a misspelt field or a
`many` relation is refused on the index's line. A non-unique index is not a
target.
Why: the previous base used this split and it worked; uniqueness read from
the field is the common case. The flat target reads like any filter and has
no name to learn; `findUnique` takes no other filter, so nothing needs
setting apart.
Typing (2026-10-20): TypeScript checks the call once before it reads the
`fields` callback; the index check waits for the real fields, or every index
would be refused and the callback's parameters lose their types. Measured
on 200 models without indexes: 0.9 % more instantiations, the same check
time.
Rejected: indexes in `.with` (they change the storage, not behaviour);
Prisma's compound key, `where: { author_slug: { author, slug } }`, a name
built from the fields that the developer must know.

## D-53: Defaults are values or functions; `json` takes a schema

Choice: `default` takes a value (`default: false`) or a function receiving
`{ caller }` (D-19): `default: () => new Date()`, or a value that depends on
who creates the record. A relation's default is the target's `{ id }`, or a
function returning it; a record of the target, `caller.user` included, fits.
Returning `undefined` gives no value; a default of the wrong type is refused
on its line. auth's `currentUser` (D-62) is that default for the record's
author. A field with a default is optional in
`create`'s input, and the default applies when the caller sends no value. A
`beforeCreate` hook (D-15) may still set or replace the value: a required
field is checked for presence after the hooks (D-67). `f.json()` accepts
`validate` (D-23): it reads the schema's output and is written its input, so
a key with a schema default is optional in `create`. Defaults are validated
(D-67), so a `json` default is of the schema's input. With the function
form, the field reads what the function returns. Without `validate`, a
`json` field reads `unknown` and is written any JSON value. Whether a
schema's output is JSON is checked when it is stored, not by its type.
Why: a function covers dates and generated values without a second option.
The author of a record is the most common server-filled field; a sample
application (2026-10-20) showed that filling it only in a hook left it
required in `create`'s type and failed validation, which ran before the hook.
Rejected: caller-dependent values only in hooks (above); `json` typed as `any`.
Example:

```ts
// Before: required in `create`'s type, and refused by validation
author: f.one(() => User).with({ access: { create: allow.private } }),
// with, on the model:
hooks: { beforeCreate: ({ data, caller }) => ... }
// After
author: f.one(() => User, {
	default: ({ caller }) => (caller.kind === 'user' ? caller.user : undefined),
}).with({ access: { create: allow.private, update: allow.private } }),

// Before: `unknown`, cast at every read
settings: f.json(),
const size = (post.settings as { size: number }).size
// After: `{ theme: 'light' | 'dark'; size: number }` when read,
// `size` optional when written
settings: f.json({
	validate: z.object({ theme: z.enum(['light', 'dark']), size: z.number().default(12) }),
	default: { theme: 'light' },
}),
const size = post.settings.size
```

## D-54: Relations say what deleting their target does

Choice: a `one` relation takes `onDelete: 'cascade' | 'restrict' |
'setNull'`, as in Prisma. Without it, a required relation restricts (the
target cannot be deleted while referenced) and an optional one sets null.
A cascade goes through the kernel: the hooks of every deleted row run (soft
delete redirects them, `afterDelete` sees them), while access rules are
checked on the row the caller deletes only, since the model's author declared
the cascade. It fits D-48: one recursive `SELECT` loads every affected row,
one statement deletes them.
Why: deleting a user who has posts must have a declared, predictable outcome;
a cascade done by the database alone would bypass soft delete and hooks, and
checking access on each child would make most cascades fail (other people's
comments under one's own post).
Rejected: no cascade (Parse), which leaves dangling pointers; cascades by
database foreign keys.

## D-55: Reads have configurable limits

Choice: limits protect the server from clients. A request arriving through a
transport, from a caller other than Master, gets 100 rows when it gives no
`take`; the default and the maximum `take` are set for the application and
overridden per model. The GraphQL transport refuses such queries nested deeper
than 10 levels, a limit set in `graphqlPlugin({ ... })`. Server code and Master,
including a request with the master key (D-49), have no limit, as in Prisma
(D-20).
Why: a forgotten `take` or a deep query from a client must not read a whole
table or exhaust the server; Master and server code are trusted, and a
developer coming from Prisma expects `findMany` to return every row.
Rejected: Parse's default limit of 100 for every caller, with `findAll` to
lift it.
Later: an iterator reading a large table in batches by cursor
(`for await (const post of Post.findEach(...))`), if paginating by hand with
`cursor` proves tedious.

## D-56: Passwords use Argon2id, sign-in is rate limited

Choice: the `auth` plugin hashes passwords with Argon2id from Node's
`node:crypto` (OWASP parameters: 19 MiB memory, 2 passes, parallelism 1) and
stores the algorithm and parameters with each hash, so they can change later
and old hashes are upgraded at the next sign-in. It limits sign-in and
password reset attempts per account and per address, stored in the database.
Why: Argon2id is OWASP's first recommendation and Node's LTS ships it, so no
native dependency is compiled; a brute-force guard must not depend on an
optional plugin.
A general limit for the whole API, per caller or per address, comes later as
a separate `rateLimit()` plugin.
Rejected: bcrypt (72-byte limit); scrypt (second choice once Argon2id is
built in); a native `argon2` package; sign-in protection left to a general
rate-limit plugin.

## D-57: A plugin is an interface of types and one `definePlugin`

Choice: a plugin declares its types in an interface extending `PluginTypes`:
its `name` and the parts it has, `options` (its entry's, `softDelete({ ... })`),
`appOptions` (its application value's), `requires` and `optional` (D-16),
`api` (what it offers other plugins), `adds` (the fields it adds to the models
that use it), `commands` (D-15), `with` (its key of the model's `.with`, D-42),
`fieldWith` (its key of a field's `.with`, D-12) and `functionWith` (its key
of a function's `.with`, D-27). Inside the interface,
`this['fields']` is the fields of the model that lists the plugin in its
`use`, `this['options']` the options of its entry there, and `this['value']`
the value of the field whose `.with` holds its rule. Its code is one
`definePlugin<T>({ name, manifest, ... })`, checked against the interface: a
different name, a missing command or `api`, or a part the interface does not
declare fails on its line. It returns `use`, the model entry, and `plugin`,
the application value (D-24, D-35), which the package exports (D-70). The
entry is overloaded: called without options it carries the plugin's types as
they are, and only an entry given options (`softDelete({ field: 'removedAt' })`)
types the model from their literal values.
Hooks (an object of functions, D-15), redirects and commands receive the
operation's facts, the model's `queries`, the entry's `options` and
`plugins`, the API of each requirement; `start` receives the application
options. A plugin's code sees a model through the fields it adds and the
system fields (D-22), never the model's own fields; a plugin that needs more
casts. Requirements are objects of plugin values keyed by plugin name:
`requires: { auth: authPlugin }`, `optional: { roles: rolesPlugin }`. A
missing, extra or swapped value fails, and `defineApp` fails when a
requirement is not in `plugins`. `manifest` is required: `{ name, version,
peerDependencies? }`, usually the package's own `package.json` imported with
`with { type: 'json' }`, or written by hand; the documentation shows the
import first and warns that a hand-written manifest drifts from the package.
At startup, the kernel refuses a plugin whose `ultimabase` range excludes the
running kernel, or whose peer range excludes an installed plugin, naming both
versions. A field type a plugin provides (`geoPoint()`, D-32) is imported
from its package and needs no `use` entry: `defineApp` fails when its plugin
is missing from `plugins`, and its `.with` takes `access` only.
Why: the community plugin ecosystem is the product (D-01): a plugin is an
interface and one call, and its author learns of a mistake on its own line,
not in a user's application. The interface is where the model's fields, an
entry's options and a field's value reach every part, `this` acting as their
type parameter; it is no global declaration (D-24), so two plugins of one
name, or two versions of one plugin, coexist. The overloaded entry costs
5.5 % more instantiations on 200 models, against 50 % for an entry that is
always generic (spike, 2026-10-20). An object of values gives each
requirement's API its type and reads like the `plugins` it receives. Seeing
only its own fields keeps a plugin from depending on models it does not know.
The manifest gives the kernel the versions to check without reading the file
system.
Rejected: a registry by name that plugins extend with `declare module`
(global: two plugins of one name fail with TS2717, two versions cannot
coexist, and D-24 would need a second global declaration); types inferred
from the code without an interface (the name inferred from the call breaks
the typing of `commands`, TS2719); an entry that is always generic (50 % more
instantiations); a non-generic entry (an option could never change a type, so
a renamed field would be typed wrong silently); `hooks: (model) => ({ ... })`
(a misspelled hook name passes); requirements as an array of values
(`requires: [authPlugin]`) or as names in the interface only; the kernel
reading `package.json` itself (file system, bundlers); field builders added
by plugins (`f.geoPoint()`), until a plugin's field type needs field rules.
Example:

```ts
// Before: the types written by hand, the code never checked against them
interface SoftDeleteModel extends FromModel {
	readonly out: SoftDeleteCommands<this['fields']>
}
export declare function softDeletePlugin(): PluginValue<'softDelete'>
export declare function softDelete(): ModelUse<
	'softDelete',
	{ readonly commands: SoftDeleteModel }
>

// After
import manifest from '../package.json' with { type: 'json' }

interface SoftDelete extends PluginTypes {
	readonly name: 'softDelete'
	readonly options: { readonly field?: string }
	readonly appOptions: { readonly purgeAfterDays?: number }
	readonly adds: DeletedField<this['options']>
	readonly commands: SoftDeleteCommands<this['fields']>
}
const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest,
	hooks: { beforeFind: ({ where, options }) => hideDeleted(where, options) },
	commands: ({ queries }) => ({
		trash: deletedOnly(queries),
		restore: ({ where }) => undelete(queries, where),
	}),
})
export const softDelete: UseOf<SoftDelete> = softDeleteDefinition.use
export const softDeletePlugin: PluginOf<SoftDelete> =
	softDeleteDefinition.plugin

// A plugin that needs others, with a hand-written manifest
interface Archive extends PluginTypes {
	readonly name: 'archive'
	readonly requires: Auth | Tenant
	readonly optional: Roles
}
const archiveDefinition = definePlugin<Archive>({
	name: 'archive',
	manifest: { name: 'ultimabase-archive', version: '1.0.0' },
	requires: { auth: authPlugin, tenant: tenantPlugin },
	optional: { roles: rolesPlugin },
	redirect: {
		delete: ({ where, queries, plugins }) =>
			markArchived(queries, where, plugins.auth.currentUserId()),
	},
})

// A field rule: the ACL plugin's key of a field's `.with`
interface Acl extends PluginTypes {
	readonly name: 'acl'
	readonly with: AclKey<this['fields']>
	readonly fieldWith: AclField<this['value']>
}
// In an application
fields: (f) => ({
	code: f.string().with({ acl: { check: (value) => value.length > 4 } }),
}),
```

## D-58: One pino-compatible logger

Choice: `defineApp({ logger })` takes any logger with pino's interface
(`info`, `warn`, `error`, `child`); without one, the kernel writes JSON lines
to the console. The kernel, plugins and D-28 correlation ids use it; a
plugin's `start`, `stop` and `api` receive it as `logger`.
OpenTelemetry comes later, as a plugin.
Why: pino's interface is the Node standard and keeps the kernel free of a
logging dependency.
Rejected: a logging library bundled in the kernel.

## D-59: `start` and `stop` drive the application

Choice: `await app.start()`, on the application `defineApp` returns (D-24),
connects the database and starts the plugins (Start hooks, D-15); `await
app.stop()` stops them. On `SIGTERM`, the application stops accepting requests,
waits for running ones and pending `*Commit` hooks, then stops.
Why: deployments restart applications constantly; work in progress must not
be cut.
Rejected: starting on import; leaving signals to each application.

## D-60: Releases are 0.x, versioned together, with Changesets

Choice: until 1.0, any minor version may break. The kernel and the official
plugins are released together with the same version number, and Changesets
writes the changelog.
Why: one number tells which official packages work together.
Rejected: independent versions per official package before 1.0.

## D-61: `npm create ultimabase` from the first release

Choice: the first release ships a minimal starter: one model, `memory()`,
GraphQL and the application the models are declared from (D-24) already
written.
Why: the starter is the first impression, and it writes the one part a
newcomer cannot guess.

## D-62: One user model, declared with `defineUser`

Choice: the `auth` plugin exports `defineUser({ name, use, fields })` (D-13),
which adds the developer's fields to the user model it owns; `name` is
required, as for every declaration (D-35). `defineUser` takes everything
`defineModel` takes, and its model has everything a model has (`.with`,
queries, commands); when `defineModel` gains an option, `defineUser` gains it
too. `use` is optional, and auth comes first in it, so `defineApp` asks for
`authPlugin()`. An application has
exactly one user model: a second `defineUser` stops startup. `caller.user` is
`{ id }` by default.
Three lines under `defineUser` give it the user model's type in every rule,
hook and function, without an import or a `use` entry:
`declare module 'ultimabase' { interface Register { user: typeof User } }`.
Only the user model goes there; plugins and models never do (D-24). auth
exports `isSelf`, the rule "the caller is this record". A field rule of the
user model that reads `caller.user` in its own body needs `: boolean`, and a
default of the user model that reads it (D-53) declares its return type,
`({ caller }): { readonly id: string } | undefined => ...`; without it,
`User` loses its type with no error on that line, only on `defineApp`.
Another model's default that reads `caller.user` needs nothing. auth exports
`currentUser`, the default "whoever creates the record" (the signed-in
caller's `{ id }`, no value otherwise), declared with its return type:
`invitedBy: f.one(() => User, { default: currentUser })` needs no annotation,
in the user model or any other.
Without it, TypeScript reports TS7023 on the rule's line and on `fields`, and
`User` becomes `any` (TS7022): typing `caller.user` needs `User`'s fields,
which hold the rule. A rule that calls a helper with a declared return type,
`({ caller }) => isEditor(caller)`, needs no annotation, and neither does a
rule of the model's `.with`. The documentation says so next to that error.
Applications with
different user models are type-checked by separate `tsconfig` files; one
program holding two declarations fails with TS2717.
Why: `caller.user` has one type, read everywhere (rules, hooks, functions);
two user models would make it a union nobody can use. An application without
the declaration loses nothing but the user's other fields; with it, a rule
reads `caller.user.role` synchronously, as Parse's `request.user`. The
declaration is the idiom of Auth.js (`Session`), TanStack Router (`Register`)
and Passport (`Express.User`). Measured on 2026-10-20 on 200 models whose
read rules all read `caller.user`: 0.09 % more instantiations, the same check
time. The `: boolean` case is a TypeScript limit of inferred models. A field's
`.with` is checked while `defineModel` infers the fields, so its rule's return
type is needed before `User` has a type. A non-generic field `.with` did not
remove it, and neither did a ternary in place of `&&` (2026-10-20). Why the
model's `.with` escapes is a hypothesis, not verified in TypeScript's source:
it is a single non-generic call at the top of the initializer, which
TypeScript would type from its declared return type without reading its
argument. Measured on 2026-10-20 with `defineUser`, `ModelFields` and
`ModelOf` on 200 models: 0.09 % more instantiations, the same check time.
Rejected: a fixed user model extended through a separate profile model; a
user model per sign-in method; a `use` entry (`use: [signedIn]`) in every
model that reads `caller.user` (forgetting it narrows `caller.user` to `{ id }`
with no error where it is forgotten); a `defineModel` bound to the user model
in a local file (importing `defineModel` from `ultimabase` instead loses the
type silently, and plugins never see it); `{ id }` only (role checks need a
load, which rules cannot do); type generation (D-11).
Example:

```ts
// Before: caller.user is { id }
read: ({ caller, where }) =>
	(caller.kind === 'user' && caller.user.role === 'editor') ||
	where({ status: 'published' }),
// error TS2339: Property 'role' does not exist on type '{ readonly id: string; }'

// After: user.ts, once for the application
export const User = defineUser({
	name: 'User',
	fields: (f) => ({
		email: f.string({ unique: true }).with({ access: { read: isSelf } }),
		role: f.enumOf(['reader', 'editor']),
	}),
})
declare module 'ultimabase' {
	interface Register {
		user: typeof User
	}
}
// post.ts: the same rule compiles, and `caller.user.role === 'admin'` fails

// A field rule of User itself: before, the cycle
role: f.enumOf(['reader', 'editor']).with({
	access: { update: ({ caller }) => caller.kind === 'user' && caller.user.role === 'editor' },
}),
// error TS7023: 'update' implicitly has return type 'any' because it does not have
// a return type annotation and is referenced directly or indirectly in one of its
// return expressions.

// After: an annotation, or a helper written once with one
const isEditor = (caller: Caller): boolean =>
	caller.kind === 'user' && caller.user.role === 'editor'
role: f.enumOf(['reader', 'editor']).with({
	access: { update: ({ caller }) => isEditor(caller) },
}),
```

## D-63: Storage names follow the database's convention, `dbName` overrides

Choice: each adapter maps model and field names to its database's convention
(PostgreSQL: `Post.createdAt` becomes `post.created_at`; MongoDB keeps the
names). `dbName` overrides the stored name on a model
(`defineModel({ name: 'Post', dbName: 'posts' })`) and on a field
(`f.string({ dbName: 'e_mail' })`); it names a table, a collection or a column
depending on the adapter. A `many` relation stores no column and takes no
`dbName`; naming a many-to-many join table is decided with the adapter.
Why: hand-written SQL needs no quotes; an existing database can be adopted;
one neutral option works on every adapter (D-51).
Rejected: `table` (meaningless on MongoDB); one option per adapter.

## D-64: Many-to-many joins carry nothing

Choice: the join table of a `many` facing a `many` (D-37) holds the two keys
only. A join that needs its own fields (an enrolment date) is an ordinary
model with two `one` relations (`Enrollment` between `User` and `Course`).
Why: Prisma works this way; an explicit model gets access rules, hooks and
queries like any other.
Rejected: fields declared on an implicit join table.

## D-65: `f.date()` is a UTC instant

Choice: `f.date()` stores an instant (`timestamptz` on PostgreSQL) and returns a
JavaScript `Date`. A calendar date without time (a birthday) comes later with
the types of D-09.
Why: an instant is unambiguous across time zones.
Rejected: timestamps without time zone.

## D-66: `httpPlugin()` is closed by default

Choice: CORS allows no origin until the developer lists them
(`httpPlugin({ cors: ['https://app.example.com'] })`), and a listed origin may
send the master key header (D-49). When `NODE_ENV` is not `production`,
local origins (`http://localhost` and `http://127.0.0.1`, any port) are also
allowed without configuration. Request bodies are limited to 1 MB by
default, configurable. Transactions keep PostgreSQL's default isolation (read
committed); writes lock their rows (D-48).
Why: the same rule as D-04: forgetting an option must not open the server. A
front-end dev server or end-to-end tests on the same machine work with no
setup, and a server started without `NODE_ENV` still accepts only local
origins, not the whole internet.
Rejected: CORS open to every origin by default; no CORS check at all outside
production (a missing `NODE_ENV` would open a deployed server); a stricter
isolation level by default, which adds retries for no common need.

## D-67: One fixed order for every operation

Choice: an operation runs in this order: `redirect` (D-15), the model's access
rule (D-10), the fields' access rules on the data the caller sent (D-44),
defaults (D-53), validation (D-23), the `before*` hooks, the check that
required fields are present, the write, the in-transaction `after*` hooks,
commit, then the `*Commit` hooks. A value written by a hook goes through
neither access rules nor validation: hooks are trusted server code, so a
`beforeCreate` hook can fill `createdBy` even when the field refuses it on
`create`, and a required field may be left to a hook.
Why: access and validation judge what the caller sent; refusing early avoids
validating or hooking a request that will fail; a field closed to clients
must stay writable by the server.
Rejected: access rules after the hooks, which would block server-filled fields
or let a hook's output be judged as the caller's.

## D-68: The first release (0.1)

Choice: version 0.1 ships these packages, each with the subset its examples
need (D-20, D-31):

- `ultimabase`: models and fields (D-07 to D-09, D-12, D-22, D-37, D-52 to
  D-54, D-63 to D-65), access rules and hooks (D-10, D-15, D-43, D-44, D-67),
  queries, callers, transactions and read limits (D-18 to D-20, D-36, D-49,
  D-55), functions, errors, logger, lifecycle, `memory()`, `defineApp`
  and the `migrate` commands with their adapter contract
  (D-02, D-24, D-26 to D-28, D-45, D-58, D-59), and field types added by
  plugins (D-32).
- `@ultimabase/postgres`, a storage adapter outside the kernel, which also
  compares models with the database and writes and applies migrations (D-26,
  D-46 to D-48, D-50, D-51).
- `@ultimabase/http` (D-16, D-27, D-66).
- `@ultimabase/graphql` (D-34, D-41, D-45, D-55).
- `@ultimabase/auth`, with `passwordPlugin()` in the same package (D-33, D-39,
  D-56, D-62).
- `@ultimabase/soft-delete` (D-17), which also proves the hooks of D-15.
- `@ultimabase/testing` (D-40) and `create-ultimabase` (D-61).

The after-commit email plugin that D-15 asks for is an example in
`examples/`, not a package. Everything else waits: D-25 (REST, files, OAuth,
realtime…), roles and ACL, the later field types (D-09, D-65), other
databases (D-51) and the `Later:` lines of D-20, D-44, D-55, D-56 and D-58.
Why: the smallest set that builds a real application end to end, from a
starter to production, and proves the plugin design.
Rejected: roles and ACL in 0.1 (functions cover simple permissions, D-10);
migrations after 0.1 (nothing could go to production).

## D-69: Vitest, and line budgets per package

Choice: tests run on Vitest. Each package has a line budget for its production
code, checked by CI: kernel 10,000, PostgreSQL 4,000, GraphQL 3,000, auth
3,000, HTTP 800, soft delete 150; a new package gets its budget in the commit
that creates it. A budget changes only in a commit that says why.
Why: Vitest runs TypeScript and ESM natively and fast, and the previous base
used it. The previous base reached 76,000 kernel lines, 10,000 PostgreSQL,
8,300 GraphQL and 9,000 auth; a budget enforced from the first commit stops
that growth instead of measuring it afterwards.
Rejected: Node's test runner (weaker watch mode and type tests); budgets set
after the code exists.

## D-70: This repository's packages use `isolatedDeclarations`

Choice: `tsconfig.base.json` enables `isolatedDeclarations` for every package
of this repository: each export has a written type, so a plugin of ours
exports its two values in three lines (D-57). The kernel does not require it
of community plugins or applications, which may export
`definePlugin(...).use` without a type.
Why: the kernel's types are heavy. Without the option, `tsc` copies each
plugin's whole inferred type into its `.d.ts`, large and unstable, sometimes
past TS7056's length limit; with it, a fast tool emits declarations file by
file, and the public surface is written out. The cost, two lines a plugin, is
paid once by its author and never by its users.
Rejected: dropping it (one-line exports, but inferred `.d.ts` files, and every
plugin's export rewritten if it came back later); requiring it of community
plugins (a constraint on their build that the kernel does not need).
Example:

```ts
// Before: refused under isolatedDeclarations (TS9019)
export const { use: softDelete, plugin: softDeletePlugin } =
	definePlugin<SoftDelete>({ name: 'softDelete', manifest })

// After, in this repository
const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest,
})
export const softDelete: UseOf<SoftDelete> = softDeleteDefinition.use
export const softDeletePlugin: PluginOf<SoftDelete> =
	softDeleteDefinition.plugin
```

## D-71: What hooks receive and return

Choice: the D-15 hooks take one object of facts, `caller` included, and
return nothing, except `beforeFind`.

- `beforeFind` gets `where` (the D-10 helper) and returns `where({ ... })`, or
  nothing. The kernel ANDs that filter into every read of the model, at every
  level: the top-level query, an `include`, `some`/`every`, `count`, and the
  lookup of the record an update or delete targets. It applies to Master too,
  and does not see the query's arguments. `access.read` decides who may see a
  record and Master bypasses it; `beforeFind` decides which records exist.
- `beforeCreate` gets `data`; `beforeUpdate` gets `record` (as stored) and
  `data` (the fields sent). Both change `data` in place, checked by type on
  each assignment. `beforeDelete` gets `record`.
- A `before*` hook refuses the operation by throwing, a `PublicError` for
  the client to see it (D-28, D-72).
- `afterCreate` and `afterDelete` get `record`; `afterUpdate` gets `record`
  (as written) and `previous`. The `*Commit` hooks get the same facts.
- There is no `afterFind`.
- A plugin's hook also gets `command`: the name of the plugin's own command the
  operation was called through, on that model only (`'trash'` for
  `Post.trash.findMany`), otherwise `undefined`. A misspelt name fails typing.
  Application hooks get no `command`.

Why: `where` is the one way to build a filter, so a misspelt field fails on
its line, and a filter that only ANDs can only narrow (D-29). In-place changes
avoid merging partial returns from several hooks. `previous` answers "did the
status change?", Parse's `original`. `afterFind` cost a pass over every
result for a use Parse developers rarely had; field access (D-44) hides
values. `command` is how soft delete shows the trash through `beforeFind`
(D-17) without a second hook.
Rejected: returning new data from `before*` hooks; a `beforeFind` that sees
and rewrites the query (it could widen it); `afterFind`; refusing by returning
`false`.
Example:

```ts
// Before: Parse
Parse.Cloud.beforeFind('Doc', ({ query }) => {
	query.notEqualTo('status', 'archived')
})
Parse.Cloud.beforeSave('Doc', ({ object, original }) => {
	if (original?.get('locked')) throw new Parse.Error(141, 'Locked.')
	object.set('title', object.get('title').trim())
})
Parse.Cloud.afterSave('Doc', ({ object, original }) => {
	const published =
		original?.get('status') !== 'published' &&
		object.get('status') === 'published'
})

// After
export const Doc = defineModel({ name: 'Doc', fields }).with({
	hooks: {
		beforeFind: ({ where }) => where({ status: { not: 'archived' } }),
		beforeCreate: ({ data }) => {
			data.title = data.title.trim()
		},
		beforeUpdate: ({ record, data }) => {
			if (record.locked)
				throw new PublicError('DOCUMENT_LOCKED', 'This document is locked.')
			if (data.title !== undefined) data.title = data.title.trim()
		},
		afterUpdate: ({ record, previous }) => {
			const published =
				previous.status !== 'published' && record.status === 'published'
		},
	},
})

// A plugin's hook, soft delete
beforeFind: ({ where, command }) =>
	where({ deletedAt: command === 'trash' ? { not: null } : null }),
```

## D-72: `PublicError` and the kernel's codes

Choice: `new PublicError(code, message, { details?, cause? })` is the one
error a client sees, Parse's `Parse.Error` with a named code. The code is a
kernel code or the application's own, in capitals (`'DOCUMENT_LOCKED'`);
`'documentLocked'` fails typing. The kernel's codes are the `ErrorCode`
union, and each keeps its meaning when the application throws it:

| Code                  | HTTP | When                                           |
| --------------------- | ---- | ---------------------------------------------- |
| `ACCESS_DENIED`       | 403  | a rule refuses a write (D-10, D-44)            |
| `NOT_FOUND`           | 404  | the target does not exist or cannot be read    |
| `VALIDATION_FAILED`   | 400  | `details.issues`: `{ path, message }` (D-23)   |
| `UNIQUE_VIOLATION`    | 409  | a unique index refuses a write (D-52)          |
| `RELATION_RESTRICTED` | 409  | `onDelete: 'restrict'` refuses a delete (D-54) |
| `INTERNAL`            | 500  | any other error, with a correlation id (D-28)  |

An application's own code is sent with status 400. `details` is JSON, and
for `VALIDATION_FAILED` lists the issues in Standard Schema's shape. An update
or delete of a record the caller cannot read fails with `NOT_FOUND`, not
`ACCESS_DENIED`, so it does not reveal that the record exists. A caught
error's `code` is typed, not `any`.
Why: a code that names the problem reads better than Parse's `141`, and a
client tests the code, not the message. The kernel knows no transport (D-16),
so an application error carries no HTTP status; one status for every
application error is what Parse does.
Rejected: numeric codes; a `status` option on `PublicError`; a registry of the
application's codes, which would be global augmentation (D-24) and only
checks comparisons on the server.
Example:

```ts
// Before: Parse
throw new Parse.Error(141, 'This document is locked.')
// client: if (error.code === 141) …

// After
throw new PublicError('DOCUMENT_LOCKED', 'This document is locked.')
throw new PublicError('NOT_FOUND', 'No such invoice.')
throw new PublicError('VALIDATION_FAILED', 'Too short.', {
	details: { issues: [{ path: ['title'], message: 'At least 3 letters.' }] },
})

// The client receives, over HTTP with status 400:
// { "code": "DOCUMENT_LOCKED", "message": "This document is locked." }
// and for `throw new Error('Connection refused.')`, status 500:
// { "code": "INTERNAL", "message": "Internal error.", "correlationId": "c0f1…" }
```

## D-73: The adapter contract

Choice: an adapter implements six methods. `start(schema)` receives every
model with its fields, relations, indexes and `dbName` overrides; `stop()`
closes it; `find(read)` and `count(read)` read; `write(write)` applies one
whole write, nested relation writes included, and returns the rows it was
asked for; `begin()` opens a transaction that has its own `find`, `count` and
`write`, plus `commit()` and `rollback()`. What an adapter receives is fully
prepared by the kernel:

- filters are normalized: `{ status: 'x' }` arrives as
  `{ status: { equals: 'x' } }`, `undefined` conditions are gone, and the
  access filters of every model read, nested `include` and relation filters
  included, are already ANDed in (D-10, D-46, D-71);
- names are the models' own; the adapter maps them to storage names with its
  database's convention and the `dbName` overrides (D-63);
- ids, timestamps and defaults are already set (D-22, D-53), and a cascade
  arrives as rows the kernel loaded and decided, through a locking `find`
  that follows the cascading relations in one statement (D-48, D-54).

The kernel keeps the transaction context (`AsyncLocalStorage`) and routes each
query to the open transaction; it rolls back after a failed query even when
the error is caught (D-36). An adapter reports a unique index refusal as a
typed error naming the model and fields, which the kernel turns into
`UNIQUE_VIOLATION` (D-72); no database message reaches a client.
`RELATION_RESTRICTED` is the kernel's own check, since the kernel runs
cascades. Every adapter executes the whole query subset of 0.1 (D-20): there
is no capability declaration. The contract suite (D-02) takes a
`statements()` count from the adapter's author to check the counts of D-46
and D-48. Comparing models with the database (D-26) joins the contract with
the PostgreSQL adapter.
Why: an adapter author reads one small interface and one input shape, and
never reimplements access, hooks, defaults or transaction rules, so every
database behaves the same. Cascades go through the kernel at no extra cost
when no hook or soft delete is involved (one statement either way), and with
one, the extra `SELECT` loads rows the hooks need, which a database cascade
cannot provide.
Rejected: adapters keeping their own transaction context, which each would
write differently; filters in every shorthand Prisma accepts; capability
declarations per operator (the previous base, ADR-0301), until a database
needs one; database foreign key cascades (D-54).
Later: a cascade option that skips hooks (Rails' `dependent: :delete_all`),
if large cascades prove slow.
Example:

```ts
// Before: Parse's StorageAdapter, about thirty methods (find, createObject,
// updateObjectsByQuery, deleteObjectsByQuery, ensureUniqueness,
// createClass, addFieldIfNotExists…); an `include` costs one more query per
// level, run by the server.

// After
interface Adapter {
	start(schema: Schema): Promise<void>
	stop(): Promise<void>
	find(read: Read): Promise<Row[]>
	count(read: CountRead): Promise<number>
	write(write: Write): Promise<Row[]>
	begin(): Promise<Transaction>
}

// The developer writes
Post.findMany(
	{ where: { status: 'published' }, include: { author: true } },
	{ as: caller },
)
// and the adapter receives, to run in one statement
const read: Read = {
	model: 'Post',
	where: {
		AND: [
			{ status: { equals: 'published' } },
			{ author: { is: { id: { equals: 'u1' } } } },
		],
	},
	include: { author: { where: userReadFilter } },
}
```

## D-74: A model's types, named from the model

Choice: `ultimabase` exports one type per need, each taking the model's type,
so application code names what a query takes and returns without type
generation (D-11):

- `RecordOf<typeof Post>`: a record as a query returns it without `select`
  or `include` (D-20); `RecordOf<typeof Post, Args>` is the record that
  arguments `Args` return, `select` and `include` included. It describes one
  record, never the list.
- `WhereOf`, `IncludeOf`, `SelectOf`, `OrderByOf`, `CreateDataOf` and
  `UpdateDataOf`: the arguments of the same name.
- `ArgsOf<typeof Post, 'findMany'>`: the whole arguments of one operation,
  the operation named by a string the editor completes.
- `InputOf<typeof fn>` and `OutputOf<typeof fn>` for a function (D-27):
  `InputOf` is what a caller sends, before validation (D-23); `run` receives
  the validated value, which a transforming schema may change.

A model file may name the record type after the model, as Zod users do:
`export type Post = RecordOf<typeof Post>`.
Why: helpers, functions and tests need these types, and Prisma's generated
`Prisma.PostWhereInput` is what developers expect. One generic per need is
the TypeScript idiom (`ReturnType`, `z.infer`). A single object of types
(`ModelTypes<typeof Post>['where']`) cannot give the result of given
arguments by indexing, so it would need a generic beside it: two mechanisms
instead of one. The types already exist in the kernel; this exposes them.
Rejected: an object of types per model; one arguments type per operation
(`FindManyArgsOf`); a separate `PayloadOf`, which `RecordOf` with arguments
covers; generated types (D-11).
Example:

```ts
// Before: Parse, the schema written a second time by hand
class Post extends Parse.Object<{ title: string; status: string }> {}
const query = new Parse.Query(Post).equalTo('status', 'published') // unchecked

// After
import type { ArgsOf, RecordOf, WhereOf } from 'ultimabase'

export type Post = RecordOf<typeof Post>
export function visible(authorId: string): WhereOf<typeof Post> {
	return { OR: [{ status: 'published' }, { author: { is: { id: authorId } } }] }
}
const withAuthor = {
	include: { author: true },
} satisfies ArgsOf<typeof Post, 'findMany'>
type PostWithAuthor = RecordOf<typeof Post, typeof withAuthor>
const rows: PostWithAuthor[] = await Post.findMany(withAuthor, { as: master })
```

## D-75: Server code calls a function with `run`

Choice: a function (D-27) is called from server code with
`fn.run(input, { as })`, or `fn.run({ as })` when it has no input. The call
does what a transport does: it checks the access rule with the caller,
validates the input, then runs the function and returns its output, typed
and not validated (D-27). Without `as` it runs as anonymous (D-19), so a
closed function refuses with `ACCESS_DENIED`, and an invalid input fails with
`VALIDATION_FAILED` (D-72). It opens no transaction (D-36); inside one, it
joins it.
Why: queries start from the model (D-18), so a call starts from the
function, with one import and its types. Parse's `Parse.Cloud.run` names the
function by a string and types nothing. `run` is the verb of the definition
too: there it receives `{ input, caller }`, here it is called with the input
and the caller, and the editor shows each signature.
Rejected: `app.run(fn, input, { as })`, which makes a function that calls
another import the application, a cycle D-18 avoids for models; exporting
the body of `run`, which skips the access rule and the validation, so tests
no longer exercise what a client calls; `call` or `invoke`, other verbs for
the same thing.
Example:

```ts
// Before: Parse
const merged = await Parse.Cloud.run(
	'mergePosts',
	{ from, into },
	{ useMasterKey: true },
)

// After
const merged = await mergePosts.run({ from, into }, { as: master })
const posts = await openPosts.run({ as: caller })
```

## D-76: Access rules are synchronous

Choice: access rules (D-10, D-44) return their result directly, never a
`Promise`, and cannot query. A check that needs other records takes the tool
that runs it without a hidden query:

| Need                                                     | Tool                                               |
| -------------------------------------------------------- | -------------------------------------------------- |
| A read decided by the caller, even through another model | `read` rule returning `where({ relation: { … } })` |
| Records that do not exist for anyone (trash, archive)    | `beforeFind` (D-71)                                |
| A write that depends on another record                   | `beforeCreate` / `beforeUpdate`, which may query   |
| A write decided by the caller and the record             | `create` / `update` / `delete` rule                |

Hooks stay asynchronous, `beforeFind` included, for data outside the
database (an external service, a flag).
Why: a read rule runs on every read of its model, at every level of an
`include` and in every `some`; a query inside it would cost a round trip each
time without showing it, breaking D-46. A rule that reads another model runs
that model's rules, with no clear caller and a risk of cycles. A
`boolean | Promise<boolean>` return weighs on every rule and on `anyOf`, the
part of the typing that was hardest to keep cheap (D-62). Accepting a
`Promise` later breaks no rule; going back to synchronous rules would.
Rejected: asynchronous rules; access checks in `beforeFind`, which also
applies to Master and is not access (D-71).
Example:

```ts
// Before: Parse, the check is a query in beforeSave
Parse.Cloud.beforeSave('Comment', async ({ object }) => {
	const post = await object.get('post').fetch({ useMasterKey: true })
	if (post.get('status') !== 'published') throw new Parse.Error(141, 'Closed.')
})

// After: a read through another model is a filter, run in the same query
export const Comment = defineModel({ name: 'Comment', fields }).with({
	access: {
		read: ({ where }) => where({ post: { is: { status: 'published' } } }),
		create: isAuthenticated,
	},
	hooks: {
		beforeCreate: async ({ data }) => {
			const post = await Post.findUnique(
				{ where: { id: data.post.connect.id } },
				{ as: master },
			)
			if (post?.status !== 'published')
				throw new PublicError(
					'POST_CLOSED',
					'Only published posts take comments.',
				)
		},
	},
})
```

## D-77: Rules and hooks see a `one` relation's key

Choice: the stored record access rules and hooks receive (`record`,
`previous`) holds each `one` relation as `{ id }`, or `null` when the
relation is optional and unset. A `many` relation stays absent. Query results
are unchanged: a relation appears only through `include` or `select` (D-74),
and `caller.user` keeps its fields (D-62).
Why: "only the author changes it" is the most common rule, and the key is a
column of the row the kernel already loads (D-48): no query, so rules stay
synchronous (D-76).
Rejected: loading the related record for rules, a query per check; a
separate `authorId` field, Prisma's spelling, which doubles every relation.
Example:

```ts
// Before: Parse, an ACL per object, or a check in beforeSave
Parse.Cloud.beforeSave('Post', ({ object, original, user }) => {
	if (original && original.get('author').id !== user?.id)
		throw new Parse.Error(119, 'Not your post.')
})

// After: the rule reads the stored key
export const Post = defineModel({ name: 'Post', fields }).with({
	access: {
		update: ({ caller, record }) =>
			caller.kind === 'user' && record.author.id === caller.user.id,
	},
})
```

## D-78: A relation write from the other side updates the target

Choice: when a `connect` or `disconnect` changes the key stored on the
target's rows (from the `many` side of a one-to-many, or the side of a
one-to-one that does not store the key), each changed target row is updated
as `Target.update` would update it: its `update` rule, its field rule on that
relation (D-44) and its update hooks run, with `caller` unchanged. A
many-to-many write changes only the join table and runs the rules of the
model written. Master skips the rules, as everywhere (D-48).
Why: otherwise writing from the other side of a relation would bypass the
target's rules and hooks; D-48 already loads the connected rows once, so the
rule costs no extra statement.
Rejected: the rule of the model written alone, a way around every rule of
the target.
Example:

```ts
// Comment.post is written by Master only
export const Comment = defineModel({ name: 'Comment', fields }).with({
	access: {
		read: allow.public,
		write: ({ caller }) => caller.kind === 'master',
	},
})

// Moves comment c1 to post p2: Comment's update rule runs on c1, so a user
// caller gets ACCESS_DENIED; `{ as: master }` passes.
await Post.update(
	{ where: { id: 'p2' }, data: { comments: { connect: [{ id: 'c1' }] } } },
	{ as: caller },
)
```

## D-79: auth's `signedIn` and `isOwner` rules

Choice: auth exports two ready-made rules (D-10), next to `isAuthenticated`
and `isSelf`. `signedIn(rule)` runs `rule` for a signed-in caller only, with
`user` (the registered user model's record, D-62) among its facts, and is
`false` for anyone else; a read rule inside it may still return
`where(...)`. `isOwner('author')` is "the caller is the user this `one`
relation points to", read from the stored key (D-77), so it fits `update` and
`delete` but not `read` or `create`, which have no stored record; a name that
is not a `one` relation of the model is refused. Both take their facts from
where they are used, and combine with `anyOf`. `signedIn` fits the user
model's own rules but not its field rules, where `user` would type the model
from itself (TS2502): there, `({ caller }): boolean => ...` stays (D-62).
Why: `caller.kind === 'user' &&` opened most rules of a real application, and
"the author only" was written by hand in every model.
Rejected: a `signedIn` in the kernel, which knows no user model; an
`isOwner` that loads the user, a query in a rule (D-76).
Example:

```ts
// Before: Parse, checks repeated in each beforeSave
Parse.Cloud.beforeSave('Post', ({ object, original, user }) => {
	if (!user) throw new Parse.Error(209, 'Sign in first.')
	if (
		original &&
		original.get('author').id !== user.id &&
		user.get('role') !== 'editor'
	)
		throw new Parse.Error(119, 'Not your post.')
})

// After
export const Post = defineModel({ name: 'Post', fields }).with({
	access: {
		create: signedIn(({ user }) => user.role !== 'reader'),
		update: anyOf(
			isOwner('author'),
			signedIn(({ user }) => user.role === 'editor'),
		),
		delete: isOwner('author'),
	},
})
```

## D-80: Tests act as a user with `asUser`

Choice: `@ultimabase/testing` exports `asUser(user)`, which builds the caller
of a signed-in user from a user record, for a test's `{ as }`. Only
`@ultimabase/testing` exports it; in an application a user caller comes from
a session (D-39). The kernel's own tests use it from Phase 2.
Why: tests acting as Master skip every access rule (D-48), so without a user
caller an application cannot test the rules that keep its data safe.
Rejected: tests that sign in through a transport, slow and tied to a sign-in
method; an `asUser` in `ultimabase`, which would let production code act as
any user without a session.
Example:

```ts
// Before: Parse, a real sign-up and sign-in per test user
const bob = await Parse.User.signUp('bob', 'secret')
await expect(
	post.save({ title: 'Hack' }, { sessionToken: bob.getSessionToken() }),
).rejects.toThrow()

// After
const bob = await User.create(
	{ data: { email: 'b@x.io', name: 'Bob' } },
	{ as: master },
)
await expect(
	Post.update(
		{ where: { id: post.id }, data: { title: 'Hack' } },
		{ as: asUser(bob) },
	),
).rejects.toThrow('ACCESS_DENIED')
```

## D-81: `anyOf` and `allOf` combine read filters

Choice: the kernel exports `allOf` next to `anyOf` (D-10). Both take the
facts and the result type from where they are used, so in a read rule each
rule may return `true`, `false` or `where(...)`. `anyOf` joins the filters with
`OR`, a `true` lets every row through and a `false` adds nothing; `allOf`
joins them with `AND`, a `false` hides every row and a `true` adds nothing.
In other rules both stay boolean, and `where` is refused there.
Why: the most common read rule, "published for everyone, my drafts for me",
needed a hand-written ternary on `caller.kind`, and `isOwner` (D-79) could not
be narrowed by a condition such as "while a draft".
Rejected: an option on `isOwner` for the extra condition, which covers one
helper only; a separate `anyFilter`, a second name for the same idea.
Example:

```ts
// Before: Parse, an ACL per object plus a query constraint in beforeFind
Parse.Cloud.beforeFind('Post', ({ query, user }) => {
	const published = new Parse.Query('Post').equalTo('status', 'published')
	if (!user) return published
	const mine = new Parse.Query('Post').equalTo('author', user)
	return Parse.Query.or(published, mine)
})

// After
access: {
	read: anyOf(
		({ where }) => where({ status: 'published' }),
		signedIn(({ user, where }) => where({ author: { is: { id: user.id } } })),
	),
	update: anyOf(
		signedIn(({ user }) => user.role === 'editor'),
		allOf(isOwner('author'), ({ record }) => record.status === 'draft'),
	),
}
```

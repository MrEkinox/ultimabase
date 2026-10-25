# Decisions

The design of UltimaBase, decided with the maintainer before any code is
written. One entry per decision; a later entry may replace an earlier one by
naming it, and the earlier one then says so under its title:
`Amended by D-104.` Read an entry together with the ones that amend it.

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
`findUnique`, `findFirst`, `findMany`, `count`, `create`, `update`,
`delete` and `deleteMany` (D-111), with `where` (scalar filters,
`is`/`isNot`, `some`/`every`/`none`, `AND`/`OR`/`NOT`), `select`, `include`,
`orderBy`, `take`, `skip` and `cursor`, and relation writes by id:
`connect` on a `one` and a `many` relation, `disconnect: true` to unset an
optional `one` relation (`null` is refused, as in Prisma),
`disconnect: [{ id }]` on a `many` relation in `update`. A `cursor` is a unique target (D-52) and also pages a nested list,
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
`upsert` and the batch operations `createMany` and `updateMany`, once it is
decided which rules and hooks they run (create's or update's for `upsert`,
per row or per batch); `omit`, which `select` covers meanwhile; nested
creation (`create` in a relation write), which ships before 1.0; `set`, `distinct` and aggregates;
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
target is missing from `models`, when two models share a name (amended
2026-10-25; a name typed `string`, from a model a function builds, is not
compared), or when an `inverse` names no field of its target (D-37); startup
stops with a message for each, for JavaScript and casts. `defineModel` and
`defineFunction` register nothing; `migrate` (D-26) and tests (D-40) import
the application without starting it.
Why: nothing implicit. One file configures the whole application, and each
model says which plugins act on it: a reader sees a model's behaviour in its
file, and no key appears because a plugin is installed elsewhere. A model is a
plain value that imports only what it uses, with no application object to
declare before it. Relation cycles are avoided by thunks read lazily and
callbacks in the final non-generic `.with`. Measured on 2026-10-20
(`bench/typing/README.md`): typing cost within 0 % to 10 % of the previous
`App.defineModel` form, at most 50 ms more on the `defineApp` line of 200
models, which also checks the plugins and the relation targets. The name
check adds 6 % of instantiations on 200 models (2026-10-25).
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

Amended by D-105.

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
Each example is a Yarn workspace that imports the packages by their public
names, and its own TypeScript program in `yarn typecheck`: an application
declares its user model once (D-62), and checking the packages' sources under
that declaration is what the packages' own tests cannot do. Its test starts it
as `yarn start` does (`node src/server.ts`, on `PORT=0`) and uses it as a
client would, over HTTP; the master key comes from `MASTER_KEY`. Coverage and
line budgets measure packages only.
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
request forgery without a CSRF token; the HTTP plugin refuses, on every
route, a form that carries cookies from another origin (D-106, amended
2026-10-24).
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

Amended by D-109.

Choice: a function's `input` is any Standard Schema; its `output` is a model
(`Todo`), a list (`[Todo]`), a named object mixing models and schemas
(`defineType`, which replaces the anonymous `{ todo: Todo, created:
z.boolean() }`, amended 2026-10-23 by D-109), a model or type or `null`
(`Todo.nullable()`), nothing, or any Standard Schema. `run` returns,
respectively, the model's record, a `readonly` array of them, an object of
those types, one or `null`, `void` and the schema's output (D-27). A paginated output
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

## D-48: Writes apply rules and hooks per row, in the fewest round trips

Choice: every write, single or bulk (`updateMany`, `deleteMany`), applies
hooks and access rules to each affected row; no API or option skips them.
Hooks run for every caller; access rules for every caller but Master.

A write costs round trips to the database, BEGIN and COMMIT included, and
each case has the fewest it can take. The contract suite counts them on
`memory()` and PostgreSQL (D-46, D-99). On PostgreSQL, queries made by hooks
aside:

| The write                                                                                                                                            | Round trips                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Nothing needs the stored row: `create`, an `update` by Master on a model without update hooks, a `delete` by Master whose reach runs no hook (D-102) | 1: one statement, which is atomic alone, without BEGIN and COMMIT                  |
| An access rule or a `before*` hook needs the stored row: `update` or `delete` by a user                                                              | 4: BEGIN, one `SELECT ... FOR UPDATE` loading the row, one write statement, COMMIT |
| An `after*` or `*Commit` hook runs                                                                                                                   | BEGIN, the write, one read per hooked row for the hook's facts, COMMIT             |
| Inside `transaction()`                                                                                                                               | the write's own statements, in the open transaction                                |

The one write statement holds every change, nested relation writes
included, through data-modifying CTEs, since the kernel generates every id
beforehand (D-22); its checks (a connected row exists, the row updated is
there) run in it too (D-99), and so does the read of the returned row.

Why: a round trip costs about 0.1 ms on one machine, 0.5 to 1 ms in one data
center and tens of milliseconds from a serverless function far from the
database, while a small statement runs in a fraction of a millisecond, so
round trips are a write's latency. A bulk write that skips per-row logic lets
data bypass the rules.

Rejected:

- A fixed cap of two statements: it left BEGIN and COMMIT out, so a write
  within it still took four round trips, and it fits neither the write
  that needs one nor the hooked write whose own queries the kernel does not
  control.
- BEGIN and COMMIT around a single statement.
- One statement per change or per nested relation.
- Bulk writes that skip hooks or rules.

Limits:

- The rows a `before*` hook adds to a write, a `connect` or a `disconnect`
  on a model with rules or update hooks, are loaded after the hook: one
  `SELECT` more, since they are unknown before it runs.
- A cascade that reaches a hook or a redirect loads one `SELECT` per
  referencing relation and level (D-90); one without is no load (D-102).
- The adapter splits a write into several statements, in one transaction,
  when PostgreSQL cannot run it as one: its sub-statements run in no set
  order and see the database as it was, so a table written twice, or read
  by a later change's filter, starts a new statement; a join table's
  distinct pairs do not (D-101).
- These counts hold on PostgreSQL; other adapters may need more (D-51).

## D-49: A master key lets transports act as Master, outside production

Choice: `defineApp({ masterKey: process.env.ULTIMABASE_MASTER_KEY })`
declares an optional master key. A transport receiving it (the
`x-ultimabase-master-key` header over HTTP) runs the request as Master, with
`caller.master.source === 'key'` (D-19). The comparison is constant-time;
every refusal is logged, and every use in production, while outside it the
HTTP plugin's line per request is enough (D-108, amended 2026-10-23).
Without a configured key, a request carrying one is refused. When `NODE_ENV === 'production'`, the key is refused even if set,
unless the developer writes `masterKey: { key, production: true }`; that key
then holds 32 characters at least, or `start` stops and names
`openssl rand -base64 32` (amended 2026-10-25). An unset key (`undefined`, in
either form) leaves the master key off.
Why: front-end end-to-end tests seed their data through the API with the key,
then test the interface; a key copied into production by mistake must not
open the database. Nothing limits the keys a client tries, and Master obeys
no rule: a short key in production is guessed. Outside production, a test's
`'secret'` is enough. The length is counted, not the entropy, which no check
measures reliably.
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
the cascade. It fits D-48: a cascade that runs no hook is one statement
(D-102); one that does loads the rows its hooks receive.
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

Amended by D-113.

Choice: the `password` plugin hashes passwords with Argon2id from Node's
`node:crypto` (OWASP parameters: 19 MiB memory, 2 passes, parallelism 1) and
stores the algorithm and parameters with each hash, so they can change later
and old hashes are upgraded at the next sign-in. It limits sign-in and
password reset attempts per account and address together, stored in the
database (D-113, amended 2026-10-24).
Why: Argon2id is OWASP's first recommendation and Node's LTS ships it, so no
native dependency is compiled; a brute-force guard must not depend on an
optional plugin.
A general limit for the whole API, per caller or per address, comes later as
a separate `rateLimit()` plugin.
Rejected: bcrypt (72-byte limit); scrypt (second choice once Argon2id is
built in); a native `argon2` package; sign-in protection left to a general
rate-limit plugin.

## D-57: A plugin is an interface of types and one `definePlugin`

Amended by D-89.

Choice: a plugin declares its types in an interface extending `PluginTypes`:
its `name` and the parts it has, `options` (its entry's, `softDelete({ ... })`),
`appOptions` (its application value's), `requires` and `optional` (D-16),
`api` (what it offers other plugins), `addedFields` (the fields it adds to
the models that use it, renamed by D-89), `commands` (D-15), `with` (its key
of the model's `.with`, D-42), `fieldWith` (its key of a field's `.with`,
D-12) and `functionWith` (its key of a function's `.with`, D-27). Inside the
interface, `this['fields']` is the fields of the model that lists the plugin
in its `use`, `this['options']` the options of its entry there, and
`this['value']` the value of the field whose `.with` holds its rule. Its code is one
`definePlugin<T>({ name, manifest, ... })`, checked against the interface: a
different name, a missing command or `api`, or a part the interface does not
declare fails on its line. It returns `use`, the model entry, and `plugin`,
the application value (D-24, D-35), which the package exports (D-70), with
the interface itself: a model or an application exported without a written
type names it in its declarations, `TS4023` otherwise (amended 2026-10-23).
The entry is overloaded: called without options it carries the plugin's types as
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
	readonly addedFields: DeletedField<this['options']>
	readonly commands: SoftDeleteCommands<this['fields']>
}
const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest,
	addedFields: (f, options) => deletedField(f, options),
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

Amended by D-93.

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
local origins (`http:` on `localhost`, `*.localhost`, `127.0.0.1` or
`[::1]`, any port; amended 2026-10-24: the hosts auth calls local, D-115)
are also allowed without configuration. Request bodies are limited to 1 MB by
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

Amended by D-89.

Choice: an operation runs in this order: the model's access rule (D-10), the
fields' access rules on the data the caller sent (D-44), defaults (D-53),
validation (D-23), the `before*` hooks, the check that required fields are
present, the write, which a `redirect` replaces (D-15, amended by D-89), the
in-transaction `after*` hooks, commit, then the `*Commit` hooks. A value written by a hook goes through
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
| `ACCESS_DENIED`       | 403  | a rule refuses a write (D-10, D-44, D-82)      |
| `NOT_FOUND`           | 404  | the target does not exist or cannot be read    |
| `VALIDATION_FAILED`   | 400  | `details.issues`: `{ path, message }` (D-23)   |
| `UNIQUE_VIOLATION`    | 409  | a unique index refuses a write (D-52)          |
| `RELATION_RESTRICTED` | 409  | `onDelete: 'restrict'` refuses a delete (D-54) |
| `UNAUTHENTICATED`     | 401  | a session token is unknown or expired (D-112)  |
| `INTERNAL`            | 500  | any other error, with a correlation id (D-28)  |

An application's own code is sent with status 400. `details` is JSON, and
for `VALIDATION_FAILED` lists the issues in Standard Schema's shape. An update
or delete of a record the caller cannot read fails with `NOT_FOUND`, not
`ACCESS_DENIED`, so it does not reveal that the record exists. A caught
error's `code` is typed, not `any`.
No message names a decision, a client's nor a developer's: an error, a log
line or a refusal says what happened and what to do, and only comments and
test titles cite `D-NN` (amended 2026-10-25).
Why: a code that names the problem reads better than Parse's `141`, and a
client tests the code, not the message. The kernel knows no transport (D-16),
so an application error carries no HTTP status; one status for every
application error is what Parse does.
The decisions are the maintainers' record, which no package ships (D-118):
`Sign-up is closed (D-113).` tells a visitor nothing, and a developer neither.
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

Amended by D-105.

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
  that follows the cascading relations in one statement (D-48, D-54);
- a write carries the counts it needs before it changes anything, its
  `checks`, and a `find` the kernel decides a write from asks for its rows
  locked (D-99).

The kernel keeps the transaction context (`AsyncLocalStorage`) and routes each
query to the open transaction; it rolls back after a failed query even when
the error is caught (D-36). An adapter reports a unique index refusal as a
typed error naming the model and fields, which the kernel turns into
`UNIQUE_VIOLATION` (D-72); no database message reaches a client.
`RELATION_RESTRICTED` is the kernel's own check, since the kernel runs
cascades. Every adapter executes the whole query subset of 0.1 (D-20): there
is no capability declaration. The contract suite (D-02) takes a
`roundTrips()` count from the adapter's author to check the counts of D-46
and D-48 (D-99). Comparing models with the database (D-26) joins the contract with
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
`previous`) holds each `one` relation the row stores as `{ id }`, or `null`
when the relation is optional and unset; the optional side of a one-to-one
stores none (D-87). A `many` relation stays absent. Query results
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
relation points to, before and after the write": the stored key (D-77) must
be the caller's, and a value written for the relation may only connect the
caller, so an author cannot hand a post to someone else or to no one. It
fits `create`, where a value that does not write the relation leaves it to
its default (`currentUser`, D-62), `update` and `delete`, but not `read`,
which has no record; a name that is not a `one` relation of the model is
refused. Moving a record to another owner takes Master or a hand-written
rule. Both take their facts from where they are used, and combine with
`anyOf`. `signedIn` fits the user model's own rules but not its field rules,
where `user` would type the model from itself (TS2502): there,
`({ caller }): boolean => ...` stays (D-62).
Why: `caller.kind === 'user' &&` opened most rules of a real application, and
"the author only" was written by hand in every model.
Rejected: a `signedIn` in the kernel, which knows no user model; an
`isOwner` that loads the user, a query in a rule (D-76); an `isOwner` on the
stored key alone, which let any signed-in user write a post in another's
name and an author give theirs away (amended 2026-10-25).
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
		create: allOf(
			isOwner('author'),
			signedIn(({ user }) => user.role !== 'reader'),
		),
		update: anyOf(
			isOwner('author'),
			signedIn(({ user }) => user.role === 'editor'),
		),
		delete: isOwner('author'),
	},
})

// Refused with ACCESS_DENIED: a post in another user's name, and an author
// giving theirs away.
await Post.create({ data: { title, author: { connect: { id: other } } } }, as)
await Post.update({ where, data: { author: { connect: { id: other } } } }, as)
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

## D-82: `ACCESS_DENIED` names the rule that refused

Choice: an `ACCESS_DENIED` error (D-72) carries `details`: `model` and
`operation` always, `field` when a field rule refused (D-44), and `via` when
the refusal comes from a relation write on the other side (D-78), as
`'Post.comments'`. The client receives them; the logger (D-58) receives the
same details and the caller's id. A record the caller cannot read still fails
with `NOT_FOUND` (D-72), so the details never reveal that a row exists.
Why: a refusal from another model's rule, as D-78 makes possible, is
unreadable without knowing which rule spoke; Parse's "Permission denied"
names neither the class nor the hook.
Limit: the client sees model and field names, which are usually public in
the GraphQL schema; an internal model written by a hook shows its name, never
its data.
Rejected: details in the log only, which hides them from the front-end
developer; the rule's source in the message, which exposes access logic; a
development-only mode, which no decision defines.
Example:

```ts
// Before: Parse
// Parse.Error { code: 119, message: 'Permission denied' }

// After: an editor calls mergePosts, Comment's update rule refuses
PublicError {
	code: 'ACCESS_DENIED',
	message: 'Comment update refused.',
	details: { model: 'Comment', operation: 'update', via: 'Post.comments' },
}
```

## D-83: Shared rules, and `isOwner` checked on its name

Choice: `anyOf` and `allOf` (D-81) also accept rules already typed, outside
any access key, so a combination is defined once in a `const` and used by
several models; it then needs every rule's facts, and a model without them is
refused where the `const` is used. `isOwner` (D-79) takes its facts from
where it is used, as `signedIn` does: a name that is not a `one` relation of
the record fails on the name, and in a read rule the name is refused with "a
read rule has no record to own".
Why: a shared rule is the first thing a team factors out, and it failed with
`unknown` facts; `isOwner('ownr')` printed five lines of model types before
"Property 'ownr' is missing".
Limit: a shared combination is checked where it is used, not where it is
written, and that message keeps the model's types. Inside an access key the
contextual signature is tried first, so its messages are unchanged.
Cost: 92 instantiations on the 200-model project with rules and schemas.
Rejected: a separate `shared(...)` helper, a second name for the same idea;
an explicit `anyOf<Facts>`, which asks the developer for a type they never
write elsewhere.
Example:

```ts
// Before: Parse, a function the developer calls from each beforeSave
async function editorOrAuthor(request) {
	const user = request.user
	if (!user) throw new Parse.Error(119, 'Permission denied')
	if (user.get('role') === 'editor') return
	if (request.original?.get('author')?.id !== user.id)
		throw new Parse.Error(119, 'Permission denied')
}

// After
export const isEditor = signedIn(({ user }) => user.role === 'editor')
export const editorOrAuthor = anyOf(isEditor, isOwner('author'))

Note.with({ access: { update: editorOrAuthor } })
Memo.with({ access: { update: editorOrAuthor, delete: editorOrAuthor } })

delete: isOwner('ownr')
// Argument of type '"ownr"' is not assignable to parameter of type '"author"'.
```

## D-84: `undefined` in data leaves a field unchanged

Choice: as in Prisma, a key whose value is `undefined` is ignored: in a
`where` it adds no condition (D-19), in `data` it leaves the field unchanged
(update) or unset (create, where the default applies), and in `take`, `skip`,
`orderBy` or `cursor` it is as if the key were absent. `null` keeps its
meaning: it clears an optional field. The types accept `undefined` on every
optional key, so they hold under `exactOptionalPropertyTypes`; a required
create field still refuses it. The kernel drops these keys before hooks see
`data` and before the adapter receives anything (D-73).
Why: a partial update built from a schema's optional fields, the most common
function, failed to compile under `exactOptionalPropertyTypes`, and the
prototype refused the `undefined` that D-19 already allowed in a `where`.
Limit: a field cannot be set to `undefined` to mean "clear it"; that is `null`.
`select` and `include` still take no `undefined`, since they shape the result
type.
Cost: none measured, 2 240 940 instantiations on the 200-model project with
rules and schemas (2 240 972 before).
Rejected: refusing `undefined` and asking for spreads such as
`...(title === undefined ? {} : { title })`, which is what Parse code does by
hand.
Example:

```ts
// Before: Parse
const post = await new Parse.Query('Post').get(id, { sessionToken })
if (title !== undefined) post.set('title', title)
if (body !== undefined) post.set('body', body)
await post.save(null, { sessionToken })

// After
export const editPost = defineFunction({
	name: 'editPost',
	input: z.object({
		id: z.string(),
		title: z.string().optional(),
		body: z.string().optional(),
	}),
	output: Post,
	run: ({ input: { id, ...data }, caller }) =>
		Post.update({ where: { id }, data }, { as: caller }),
})
```

## D-85: Each package covers at least 90 % of its code

Choice: every package's production code (`packages/*/src`, without tests and
`test/` fixtures) is covered at 90 % or more on lines, statements, functions
and branches, each package on its own. `yarn test` measures it with the V8
provider and fails under the floor, so `yarn validate` and CI enforce it.
95 % is the target, not a ceiling. Coverage-ignore comments are refused by
Oxlint (`no-warning-comments`): uncovered code is tested, removed or
restructured. A package that only PostgreSQL can test will be measured by
`yarn test:postgres` with the same floor; that command gets coverage with the
first such package, since today it would measure the kernel at 0 %.
Why: the kernel is a contract for adapters and plugins; a floor per package
keeps a well-tested package from hiding an untested one, and branches catch
the refusal paths that a happy-path test skips.
Limit: coverage proves code ran, not that a test checked it; review still
judges the assertions. Code written for a later slice counts against the
floor until its slice tests it.
Cost: about 2 s on `yarn test`, and the `@vitest/coverage-v8` devDependency.
Rejected: one floor for the whole repository, which a large package can carry
for a small one; a 95 % floor, which pushes tests for invariants that cannot
fail.

## D-86: Access rules on relations, filters and written rows

Choice: five details of D-10, D-44 and D-78 at run time.

1. A field rule on a `many` relation receives
   `value: { connect, disconnect }`, each a list of `{ id }` as the caller
   sent it, `[]` when absent.
2. `create` and `update` return the written row even when the model's read
   rule would hide it afterwards. Field read rules still hide its fields,
   and its includes follow their own read rules. The result type stays
   non-nullable.
3. A caller other than Master that filters, sorts or targets a row (`where`,
   `orderBy`, `cursor`, a unique `where`) on a field with a read rule, at
   any depth, gets `INVALID_QUERY` with the path, as
   `where.author.is.email: User.email has a read rule; only Master filters on it.`
4. A row the caller cannot read is absent everywhere:
   - an include leaves it out, and a `one` include reads `null`;
   - relation filters (`is`, `isNot`, `some`, `every`, `none`) see only
     readable rows, so `is: null` holds when the target is unreadable;
   - a `connect` to it fails with `NOT_FOUND`
     ('A connected Post does not exist.'), and a `disconnect` of it
     changes nothing;
   - `update`, `delete` and a `cursor` on it act as on a missing row.
5. A read rule's `where` is trusted server code. The kernel ANDs it as
   written: other models' read rules are not applied to its relation
   conditions, and it may filter on fields that have a read rule.

The rules D-78 runs on the other side's rows come with this slice; the
update hooks it also calls come with the hooks.

Why:

1. The full list after the write needs a query, which a rule cannot make
   (D-76). What the caller asked is what Parse's `AddRelation` and
   `RemoveRelation` show.
2. The creator supplied the data. A nullable result would add a null check
   to every `create` for a rare case.
3. Parse lets a query constrain a protected field, which leaks its value one
   guess at a time. `ACCESS_DENIED` is for writes (D-72).
4. Otherwise a count, an `is: null` or a failed `connect` tells a caller that
   hidden rows exist.
5. Applying other models' rules to a rule's own filter cycles when Comment
   reads through Post and Post through Comment. The developer writes that
   filter and answers for it.

Limit: a field read rule's `record` holds a `one` relation as `{ id }`. When
the same query includes that relation and the caller cannot read its target,
the include is `null` and so is the key the rule sees, which fails closed for
an owner check.

Limit: a write that repeats a unique value of a row the caller cannot read
fails with `UNIQUE_VIOLATION`, which tells the caller that row exists. The
index is the database's, and accepting the write is not possible; Parse
answers the same way (amended 2026-10-23).

Rejected:

- the list after the write as the `many` value;
- a nullable write result;
- `ACCESS_DENIED` for a filter on a hidden field;
- relation filters that count unreadable rows;
- read rule filters rewritten with the target's rules.

Example:

```ts
// Before: Parse, a protected field can still be queried
const query = new Parse.Query('_User').startsWith('email', 'a')
await query.count({ sessionToken }) // guesses the emails, letter by letter

// After
await User.count({ where: { email: { startsWith: 'a' } } }, { as: caller })
// INVALID_QUERY where.email: User.email has a read rule; only Master filters on it.

// 1. The many value
comments: f.many(() => Comment).with({
	access: { update: ({ value }) => value.disconnect.length === 0 },
}),

// 2. Drafts are unreadable, yet the author gets the draft they created
const draft = await Post.create(
	{ data: { title: 'Soon', status: 'draft', author: { connect: { id } } } },
	{ as: caller },
)
draft.title // 'Soon'

// 4. Unreadable rows are absent
await Comment.count({ where: { post: { is: null } } }, { as: caller })
// counts the comments of drafts
await Comment.create(
	{ data: { text: 'Hi', post: { connect: { id: draft.id } } } },
	{ as: caller },
)
// NOT_FOUND A connected Post does not exist.

// 5. A rule's filter is trusted: it may read the hidden email
access: { read: ({ where }) => where({ author: { is: { email: { endsWith: '@team.io' } } } }) }
```

## D-87: A rule's record omits the optional side of a one-to-one

Choice: the `record` and `previous` types of access rules and hooks hold only
the `one` relations the row stores (D-37). The optional side of a one-to-one
is absent, as it already is at run time. Startup's inverse resolution decides
which side that is: a named `inverse`, or else the target's `one` relation
that points back to the model.
Why: that side has no column, and reading the key from the other table is a
query, which a rule cannot make (D-76, D-77). A field that the type offers
but that is always `undefined` reads as "unset" and fails an owner check
silently.
Cost: typing 200 models with a one-to-one each goes from 405,172 to 661,306
instantiations, and type checking from about 0.25 s to 0.34 s.
Rejected:

- loading the key with a query for each rule;
- `{ id } | null | undefined` on that side;
- write rules that return a filter ANDed into the write, as ZenStack does: it
  reads the other side in the database, but a create must write, check and
  roll back (D-36), which runs the hooks before the rule (D-67). To revisit
  if usage asks for it.

Example:

```ts
// Before: Parse, the pointer lives on one side only
const passport = await new Parse.Query('Passport')
	.equalTo('holder', person)
	.first({ useMasterKey: true }) // a query to learn whether one exists

// After: the stored side holds the key, the other side has none
export const Passport = defineModel({
	name: 'Passport',
	fields: { holder: f.one(() => Person) },
}).with({
	access: {
		delete: ({ caller, record }) =>
			caller.kind === 'user' && record.holder.id === caller.user.id,
	},
})
export const Person = defineModel({
	name: 'Person',
	fields: { passport: f.one(() => Passport, { optional: true }) },
}).with({
	access: {
		delete: ({ record }) => record.passport === null,
		// error TS2339: Property 'passport' does not exist on type 'StoredRecord<...>'
	},
})
```

## D-88: Hooks, validation and transactions at run time

Choice: eleven details of D-15, D-23, D-36, D-67 and D-71 at run time.

1. A `*Commit` hook is awaited before its operation, or the outermost
   `transaction`, resolves. A failure is logged at `error` with a
   correlation id (D-28) and is not thrown.
2. `beforeFind` runs only for the models a query reaches: the queried model,
   its includes, its relation filters, a `connect`'s targets and the rows a
   relation write moves. It runs at most once per query and model.
3. When an `after*` hook runs, `create` and `update` read their result again
   after it, so the hook's writes show. Without one, the write returns its
   row itself.
4. A `validate` function that throws refuses with `VALIDATION_FAILED` and the
   issue `{ path: [field], message: error.message }`. A schema's issues get
   the field's name in front of their path.
5. `beforeFind`'s filter is trusted server code, as a read rule's (D-86): it
   may filter on a field with a read rule, and other models' rules do not
   apply to its relation conditions.
6. `create` and `update` return the written row even when `beforeFind` would
   hide it, as for a read rule (D-86).
7. After the `before*` hooks, the kernel checks the data again. A required
   field left empty gives `VALIDATION_FAILED` (`'Required.'`); a value of
   the wrong type, written by a hook or by `validate`, is a server bug and
   fails with an internal error.
8. Every query runs in the open `transaction`; outside one, a write opens its
   own. Once a query has failed in a transaction, the next ones fail too, as
   in PostgreSQL.
9. A row a relation write moves (D-78) runs the target's `beforeUpdate`, with
   `data` holding that relation as `{ connect: { id } }` or
   `{ disconnect: true }`, then `afterUpdate` and `afterUpdateCommit`. The
   hook may add fields to `data`; the relation itself is written as the
   caller asked. The moved row's `updatedAt` moves, as `Target.update`'s
   would.
10. Without a `logger`, the kernel writes JSON lines to the console (D-58).
    `ACCESS_DENIED` is logged at `warn` with its details and the caller's id
    (D-82).
11. A relation value the caller did not send, written by a default or a
    `before*` hook, skips the target's access rules but not its
    `beforeFind`: a `connect` to a row `beforeFind` hides fails with
    `NOT_FOUND`.

Why:

1. A test or a serverless function that ends when the operation resolves
   would otherwise lose the email; Parse's unawaited `afterSave` loses its
   errors.
2. A soft delete's or a tenant's `beforeFind` on every model would run for
   each query, even on models it never reads.
3. A hook that writes the row it follows, a counter or a status, would
   otherwise return stale data; a second read on every write costs a round
   trip D-48 does not need.
4. A function has no other way to say why it refuses; its message is what
   the developer wrote for the client.
5. Same reason as D-86 for a read rule's filter.
6. Same reason as D-86 for a written row a read rule hides.
7. A required field may be left to a hook (D-67), so it can only be checked
   after it. A client never chose a hook's value, so a wrong one is not the
   client's fault.
8. PostgreSQL refuses every statement of an aborted transaction; `memory()`
   must behave the same, or tests pass that fail in production.
9. D-78 runs the target's update hooks; a move writes no other field, and
   one changed by the hook would lose its `connect` check.
10. ACCESS_DENIED is the error a developer debugs most; the log names who
    was refused.
11. D-67 skips access rules for a hook's values; a default is server code
    too. `beforeFind` is not an access rule: a soft-deleted row stays out of
    reach whoever writes the relation.

Rejected:

- `*Commit` hooks run without waiting;
- every model's `beforeFind` at each query;
- a read after every write;
- a `validate` function returning an error message instead of throwing;
- validating hook values, which D-67 rejects;
- queries that keep running in a failed transaction.

Example:

```ts
// Before: Parse, afterSave is not awaited and its errors are lost
Parse.Cloud.afterSave('Order', async ({ object }) => {
	await sendReceipt(object)
})

// After
export const Order = defineModel({ name: 'Order', fields }).with({
	hooks: {
		// in the transaction: a failure rolls the order back
		afterCreate: async ({ record }) => {
			await Invoice.create(
				{ data: { order: { connect: { id: record.id } } } },
				{ as: master },
			)
		},
		// after commit, awaited: a failure is logged, the order is kept
		afterCreateCommit: async ({ record }) => sendReceipt(record),
	},
})

await transaction(async () => {
	await Order.create({ data }, { as: caller })
	await Stock.update({ where, data: { count: 0 } }, { as: master })
	// throws: the order and its invoice roll back, no receipt is sent
})

// A validate function refuses by throwing
slug: f.string({
	validate: (value) => {
		if (!/^[a-z-]+$/.test(value)) throw new Error('Lowercase letters only.')
		return value
	},
}),
// PublicError VALIDATION_FAILED,
// details.issues: [{ path: ['slug'], message: 'Lowercase letters only.' }]
```

## D-89: Plugins at run time

Amended by D-96.

Choice: seven details of D-15, D-57, D-67 and D-71 at run time. It replaces
D-67's place for `redirect` and D-57's name `adds`.

1. A redirected `delete` runs the path of a `delete`: the lookup of its row
   (`beforeFind`, `NOT_FOUND`), the model's `delete` access rule, the
   `beforeDelete` hooks, then the redirect in place of the write, given
   `where: { id }` of the row found, in the operation's transaction. Then
   `afterDelete` with the record as it was, the commit and
   `afterDeleteCommit`. The redirect's own queries run their own pipeline.
   `delete` returns the row as stored after the redirect, under the caller's
   field rules, or the record as it was when the redirect removed it.
2. While a command runs, the queries it makes on its model give the
   plugin's hooks on that model `command`, its name. A query a hook makes,
   the application's or a plugin's, gets no `command`. A command is a
   function or an object of functions (`trash: queries`).
3. The interface declares a plugin's fields in `addedFields`, and its code
   builds them in `addedFields: (f, options) => ({ ... })`, required when
   the interface declares them. It runs once per model entry, with the
   entry's options (`{}` without). Its types are checked with the default
   options: a field that an option names or adds needs a cast in the
   plugin's code, never in the application's.
4. A plugin's hooks run before the application's, in `plugins` order
   (D-29); every `beforeFind` filter is ANDed. Their facts add `queries`,
   the model's kernel queries, the entry's `options`, `plugins` and
   `command`.
5. `defineModel` refuses: a `use` value no plugin's entry returned, a plugin
   listed twice in `use`, an added field whose name a model field, another
   plugin's field or the kernel holds, two plugins adding one command, a
   command named after a model method (`findMany`, `with`), and two plugins
   redirecting `delete`. `start` refuses: a `plugins` value no plugin
   returned, two plugins of one name, a plugin a model uses that is missing
   from `plugins` or comes from another `definePlugin`, and a requirement
   missing from `plugins`.
6. `plugins.auth` is read when used: reading it before `start` throws. At
   `start`, each plugin's `api(context)` runs once, after the APIs of the
   plugins it requires or optionally uses; a cycle of requirements stops
   startup naming its plugins. `context` holds the application value's
   options (`{}` without), `plugins` and the logger.
7. Later: a plugin's `start` and `stop`, the manifest's version checks
   (D-58, D-59), Identify, with `caller.user` (with auth), and a plugin
   reading its own `.with` key (with ACL).

Why:

1. The redirect only changes how the row goes away. Running the update's
   access rule instead of the delete's would let a caller who may edit but
   not delete delete, and Master would skip every rule. An application's
   `afterDeleteCommit` keeps running when soft delete is installed (D-54:
   "afterDelete sees them"). The redirect's update may run as Master and
   return fields the caller cannot read; the kernel's read keeps them out.
2. `restore`'s update must find the deleted row, while an application hook
   that lists posts during it must not see the trash.
3. Types are erased at run time: the kernel needs the code to create the
   column. Inferring the types from the code instead is what D-57 rejects
   (TS2719, and an option could not change a type). `fields` already names
   the model's fields inside the interface (`this['fields']`).
4. D-29's order, plugins first.
5. A conflict a model alone holds is found where the model is written;
   one of the application is found where it is assembled.
6. Commands are built by `defineModel`, before any application starts. A
   plugin's API may read the APIs it needs as it is built.
7. Each needs a part that does not exist yet.

Rejected:

- `redirect` before the access rule, as D-67 had it;
- a redirected `delete` running only the update's hooks;
- `command` seen by every query that runs during a command;
- `fields` as the name, or field types inferred from `addedFields`;
- plugin hooks after the application's.

Example:

```ts
// Before: Parse, no redirect; the client gets an error, the access rule is
// the update's
Parse.Cloud.beforeDelete('Post', async ({ object }) => {
	object.set('deletedAt', new Date())
	await object.save(null, { useMasterKey: true })
	throw new Parse.Error(141, 'Soft deleted.')
})

// After
interface SoftDelete extends PluginTypes {
	readonly name: 'softDelete'
	readonly addedFields: {
		readonly deletedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: SoftDeleteCommands<this['fields']>
}
const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest,
	addedFields: (f) => ({ deletedAt: f.date({ optional: true }) }),
	hooks: {
		beforeFind: ({ where, command }) =>
			where({
				deletedAt: command === undefined ? null : { not: null },
			}),
	},
	// Runs after the `delete` access rule and `beforeDelete`.
	redirect: {
		delete: ({ where, queries }) =>
			queries.update({ where, data: { deletedAt: new Date() } }, M),
	},
	commands: ({ queries }) => ({
		trash: queries,
		// Its update sees `command: 'restore'`, so it finds the deleted row.
		restore: ({ where }) =>
			queries.update({ where, data: { deletedAt: null } }, M),
	}),
})

await Post.delete({ where: { id } }, { as: caller }) // the delete rule
await Post.trash.findMany({}, { as: caller }) // the deleted posts
await Post.restore({ where: { id } })
```

## D-90: Cascades at run time

Choice: seven details of D-54 at run time.

1. A `delete` runs its lookup and its model's `delete` access rule, then
   loads every row the delete reaches, level by level: each stored `one`
   relation whose target is a deleted row applies its `onDelete`. The rows
   are loaded as stored, whatever `beforeFind` hides, and without access
   rules (D-54).
2. A `restrict` relation from a row the cascade does not remove refuses the
   whole delete with `RELATION_RESTRICTED`, naming the model and the field,
   before any hook runs. A row the cascade removes does not refuse.
3. A `setNull` row runs its model's update hooks, as a row a relation write
   moves (D-88): `beforeUpdate` with `data` holding the relation as
   `{ disconnect: true }`, to which the hook may add fields; its `updatedAt`
   moves. A row also deleted by the cascade is only deleted.
4. A cascaded row whose model has a `redirect` (D-89) is redirected as a
   direct delete: its row stays, so the cascade does not go past it. A
   redirected row deleted directly cascades nothing.
5. Hook order: the `beforeUpdate` of the `setNull` rows, the `beforeDelete`
   of the deleted rows, the deepest first and the row the caller deletes
   last, then the redirects, then one write holding every `setNull` and
   every delete. The `after*` hooks follow in the same order, and the
   `*Commit` hooks once it commits.
6. The links of a deleted row in a many-to-many join are removed by the
   adapter with the row, without hooks, since a join has no model (D-64).
7. A row reached twice, through a cycle or two parents, is deleted once,
   and each of its keys is emptied once.

Why:

1. A row `beforeFind` hides still holds a key, and skipping it would leave
   the key pointing at nothing. A cascade that runs no hook loads no row
   (D-102).
2. Refusing before the hooks leaves no hook's write to roll back and never
   half-empties a table; a row the cascade removes no longer references
   the target.
3. A search index, an audit log or `updatedAt` must see the change, or an
   index keeps showing a deleted author. D-88 already writes a moved row
   this way.
4. The redirected row still exists, so its own children keep a valid key.
5. A child's `afterDelete` still finds its parent's record in the facts it
   receives, and one write keeps the delete atomic and D-48's statement
   count.
6. A join row is the relation itself, not a record anyone hooks.
7. A self relation, a tree of categories, would otherwise loop.

Rejected:

- a `setNull` written without hooks;
- `restrict` checked after the hooks;
- cascades that skip rows `beforeFind` hides;
- one write per level.

Limit: the rows a delete reaches are loaded before its hooks run, so a row a
hook creates during the delete, referencing a deleted row, is not reached.
Creating a child of the row being deleted is the developer's error; checking
every delete again after its write would make every application pay for it.

Later: the rows a hooked cascade reaches in one read of the adapter, in
place of a read per level (D-48, D-102).

Example:

```ts
// Before: Parse, no cascade; each relation is cleaned by hand
Parse.Cloud.afterDelete('User', async ({ object }) => {
	const posts = await new Parse.Query('Post')
		.equalTo('author', object)
		.find({ useMasterKey: true })
	await Parse.Object.destroyAll(posts, { useMasterKey: true })
})

// After
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		author: f.one(() => User, { onDelete: 'cascade' }),
		editor: f.one(() => User, { optional: true, inverse: 'edited' }),
	}),
})

await User.delete({ where: { id } }, { as: caller })
// the posts of the user are deleted, each through its delete hooks;
// the posts they edited keep `editor: null`, through their update hooks
```

## D-91: `start` and `stop` at run time

Choice: eight details of D-58 and D-59 at run time.

1. `start` starts the database, builds the plugins' APIs (D-89), then runs
   each plugin's `start`, after the plugins it needs; the application is
   already running, so a `start` may query (seed). `stop` runs the plugins'
   `stop` in the reverse order.
2. A plugin's `api`, `start` and `stop` receive a child of the logger bound
   to `{ name: '<plugin>' }`; the kernel logs under `{ name: 'ultimabase' }`.
   pino-pretty shows it before each message: `INFO (cache): Warm.`
3. A `start` that fails stops the plugins already started, in reverse, then
   the database, and `start` rejects with its error.
4. A `stop` that fails is logged by the plugin's logger; the other plugins
   and the database still stop, and `stop` rejects with the first error.
5. After the plugins' `stop`, `stop` waits for the running queries and
   transactions, their `*Commit` hooks included, then stops the database.
   The kernel refuses no query while it stops: refusing requests is the
   HTTP plugin's `stop`, which stops first since it needs the others.
6. `start` listens once to `SIGTERM`, and `stop` removes the listener. On
   the signal, the application stops, then sends itself `SIGTERM` again,
   which ends the process with the signal's exit code; a second `SIGTERM`
   during the stop ends it at once. A failed stop is logged first.
7. Two `stop` calls at once share one stop; `stop` before `start` does
   nothing.
8. The kernel logs `Application started.` and `Application stopped.` at
   `info`.

Why:

1. A plugin relies on what it needs from its first line to its last.
2. A developer sees which plugin wrote each line without each plugin
   prefixing its own; `name` is the field pino and pino-pretty already
   read, so a pino logger shows it as is, and JSON lines stay parsable.
3. An application that failed to start holds no connection.
4. One broken plugin must not leave the database open, and a test still
   sees the failure.
5. A deployment must not cut a write or lose an email; a query a running
   hook makes must still run.
6. Docker and Kubernetes read the signal's exit code, and `process.exit`
   would cut whatever else the application keeps open.
7. A `SIGTERM` during a test's `stop` would otherwise stop the database
   twice.
8. They are the first lines read in a deployment's logs.

Rejected: a stop timeout (the orchestrator kills the process after its own
grace period); a message prefix such as `[cache]` written by the kernel
(it would double pino-pretty's and change the plugin's message); `SIGINT`
(Ctrl-C must stop a development server at once).

Later: the manifest's version checks (D-57), in their own roadmap item.

Example:

```ts
// Before: Parse Server, the application closes everything by hand
const server = app.listen(1337)
process.on('SIGTERM', () => {
	server.close(async () => {
		await redis.quit()
		await mongoose.disconnect()
		process.exit(0)
	})
})

// After: each plugin owns its resource
export const cache = definePlugin<Cache>({
	name: 'cache',
	manifest,
	start: async ({ options, logger }) => {
		await client.connect(options.url)
		logger.info('Connected.') // {"name":"cache","msg":"Connected.",...}
	},
	stop: async () => client.quit(),
})

await app.start() // SIGTERM now stops the application cleanly
```

## D-92: A dependency earns its place by removing code we would own

Choice: a package takes a dependency when it replaces code we would
otherwise write and maintain, and whose correctness is a subject of its own
(a format, a standard, security, edge cases). The dependency is widely used,
maintained, and brings few dependencies of its own. Each use is challenged
in the decision or the commit that adds it: what it removes, and why Node or
twenty lines of our own would not do.

Why: a small, proven library is less code to maintain and fewer bugs than
our own copy of it; a dependency that saves nothing is only one more thing
to update and to trust.

Rejected: no dependencies as a rule (we would rewrite version ranges, for
instance, and get them wrong); a dependency for what Node already does or
for a few trivial lines.

Example: `semver` for the manifest's version checks (D-57): no dependencies,
the parser npm itself uses, and version ranges are full of edge cases.
Counter-example: `pino-pretty` for the default logger (D-93): a development
tool with about fifteen dependencies, for a line format Node prints in a
few lines.

## D-93: The default logger is readable in a terminal

Choice: amends D-58. Without a `logger`, the kernel's console logger writes a
readable line when the stream it writes to is a terminal (`isTTY`; stdout
for `info`, stderr for `warn` and `error`), and the JSON lines of D-58
everywhere else:

```text
10:42:07 INFO  [ultimabase] Application started.
10:42:09 WARN  [ultimabase] Order create refused. model=Order callerId=ada
10:42:12 ERROR [cache] The plugin failed to stop.
    Error: Connection lost.
        at …
```

The time is local; the level is colored with `util.styleText`, which drops
colors when the terminal has none or `NO_COLOR` is set; the `name` binding
(D-91) is shown in brackets; the other bindings and fields follow as
`key=value`, strings quoted when they hold spaces, quotes or `=`, other
values as JSON; each error is written under the line as its stack, indented.
No dependency (D-92).

Why: a developer running the application reads its logs in a terminal, and
JSON lines there are hard to read; a log collector reads JSON, and its
stream is never a terminal.

Rejected: `pino-pretty` (D-92); choosing the format from `NODE_ENV`, which
applications often leave unset; one choice for both streams (`2> file` would
write readable lines to a file).

Limit: a container started with a terminal (`docker run -t`) writes readable
lines; an application that wants JSON there gives `logger: pino()`.

Later: pino as the default logger, for its `redact`, with the auth plugin
(D-62).

Example:

```ts
// Before: Parse Server, the developer configures a logger to read anything
new ParseServer({ ..., logLevel: 'info', verbose: false, loggerAdapter: … })

// After: nothing to configure
await app.start()
// In a terminal: 10:42:07 INFO  [ultimabase] Application started.
// In production: {"level":"info","time":…,"name":"ultimabase","msg":"Application started."}
```

## D-94: The adapter contract suite

Choice: `@ultimabase/testing` (D-40) exports `testAdapter(name, create)`,
which declares, with Vitest, the tests every adapter passes alike (D-02,
D-73). `create` returns an adapter on an empty database; the suite calls it
for each test, starts an application of its own models on it and stops the
application after the test. It cleans nothing.

The suite checks what a developer sees, through the public API
(`defineApp`, `Model.findMany`, `transaction`…), not the adapter's methods
one by one:

- every operator of D-20 on each 0.1 field type, `null` as a value and as
  unknown in a comparison, AND, OR and NOT;
- `is` and `isNot` on a one relation, `some`, `every` and `none` on a many
  relation;
- `orderBy` with nulls last ascending, `skip`, `take`, a cursor and a
  negative `take`;
- nested `include` and `select`, filtered, ordered and paged; `count`;
- `create`, `update` and `delete`; connect and disconnect on each relation
  kind; a deleted row's links removed;
- `UNIQUE_VIOLATION` on a field and on an index, `NOT_FOUND` on a missing
  connect, the data unchanged after either;
- a transaction's commit, its rollback when the callback throws or after a
  failed write, its own writes seen inside and not outside before the commit.

The kernel's `memory()` runs the suite in the package's own tests.

Why: an adapter author writes one line and gets the contract as tests; a
test through the public API keeps passing when the adapter's interface
changes, and checks the kernel and the adapter together, as the developer
uses them.

Rejected: tests that call `find` and `write` directly (they repeat the
kernel's planning in every test and break with each change of D-73); a
`reset` the suite calls between tests (an adapter on a fresh database is
simpler to write and cannot leak rows from one test to the next).

The details every adapter follows, checked by the suite (amended
2026-10-24):

- `%` and `_` are characters in `contains`, `startsWith` and `endsWith`, not
  patterns: an SQL adapter escapes them in its `LIKE`.
- `null` is unknown in a comparison, as in SQL, inside `every` too: a book
  without pages does not fail `every: { pages: { gt: 200 } }`.
- Two json values are equal when their content is, keys in any order
  (`jsonb` in PostgreSQL).
- Strings sort by code point, the order of their UTF-8 bytes and of
  PostgreSQL's `C` collation: `ｚ` (U+FF5A) before `😀` (U+1F600), which
  UTF-16 code units order the other way.
- The kernel refuses what a database would change or fail on: a string, an
  id, a text operand or a json string or key with a NUL or a lone surrogate,
  and a date outside years 1 to 9999 in UTC. A write fails with
  `VALIDATION_FAILED`, a filter or a `connect` with `INVALID_QUERY`.
- `-0` equals `0` in a filter, in a number or in json, and in a unique field,
  and is read back as `0` in both (amended 2026-10-25): `pg` sends a number
  as text, and JSON text has no `-0`.
- A json field cannot be sorted: `orderBy: { meta: 'asc' }` fails typing
  (amended 2026-10-25) and, for JavaScript and casts, with `INVALID_QUERY`;
  GraphQL's `OrderByInput` has no json field. Each
  database orders json its own way.
- A date goes to the database and comes back in UTC, whatever the time zone
  of the server process and of the database session: an offset in seconds,
  as Paris's +00:09:21 before 1911, is lost otherwise.

Why the refusals (amended 2026-10-24): PostgreSQL refuses a NUL in `text`
and `jsonb`, replaces a lone surrogate, and stores the years 0 and 10000
but reads them back as an invalid date. Refused by the kernel, these values
fail the same way on every adapter, with the field's path, and no stored
row comes back different from what was written.

Limit (amended 2026-10-24): a json object comes back with its keys in the
order its database keeps, sorted in PostgreSQL; its content is unchanged.
`toEqual` ignores that order; only a test of the JSON text sees it, which
no adapter can fix (amended 2026-10-25).

Limit: how an adapter makes other writes wait during a transaction is its
own (memory takes a lock, PostgreSQL row locks); the suite checks only that
no one sees uncommitted writes.

Later: the statement counts of D-46 and D-48 with the PostgreSQL adapter
(Phase 3); cascades (D-54) once PostgreSQL runs them; `updateMany` and
`deleteMany` once the kernel has them.

Example:

```ts
// Before: Parse Server, one suite run against each database by hand
// PARSE_SERVER_TEST_DB=postgres npm test, with it_exclude_dbs(['postgres'])
// on the tests a database fails.

// After: an adapter's whole test file
import { testAdapter } from '@ultimabase/testing'
import { postgres } from '@ultimabase/postgres'

testAdapter('postgres', () => postgres({ url: process.env.TEST_DATABASE_URL }))
```

Example of the refusals (amended 2026-10-24):

```ts
// Before: memory() stores it, PostgreSQL fails with a raw driver error
await Post.create({ data: { title: 'a\u0000b' } })
// memory: stored; PostgreSQL: invalid byte sequence for encoding "UTF8": 0x00
await Post.create({ data: { publishedAt: new Date('+010000-01-01') } })
// PostgreSQL: stored, then every read of the row throws "Invalid time value"

// After: both refused alike, before the database
await Post.create({ data: { title: 'a\u0000b' } })
// VALIDATION_FAILED, title: "Expected a string without a NUL or a lone surrogate."
await Post.findMany({ orderBy: { meta: 'asc' } })
// INVALID_QUERY, orderBy.meta: "is a json field, which cannot be sorted"
```

## D-95: The manifest's version checks

Choice: the checks of D-57 run in `start`, before the database starts, with
`semver` (D-92):

- `definePlugin` refuses a manifest whose `name` is empty, whose `version` is
  not a version, or whose `peerDependencies` holds anything but valid ranges;
  the error names the plugin and the field.
- The kernel knows its version from its own `package.json`, imported with
  `with { type: 'json' }`.
- Each key of `peerDependencies` is a package name: `ultimabase` is the
  running kernel, any other is matched against the `manifest.name` of the
  installed plugins. A peer that is not installed is skipped; `requires`
  already refuses a missing plugin.
- A range accepts prereleases (`includePrerelease`): kernel `1.3.0-beta.1`
  runs a plugin written for `^1.0.0`; `2.0.0-beta.1` does not.
- A plugin that gives `ultimabase` no range starts, with a warning.
- `ultimabase` and `@ultimabase/testing` are published at one version, so an
  adapter tested with the suite of `1.4.0` runs on kernel `1.4.0`; a test of
  the testing package checks it.

Before, a plugin built for another kernel failed later, somewhere in a hook:

```ts
// ultimabase-archive/package.json: "peerDependencies": { "ultimabase": "^2.0.0" }
await app.start() // starts; the first delete throws a TypeError in a hook
```

After, `start` refuses it and names both versions:

```ts
await app.start()
// Error: ultimabase-archive 1.0.0 needs ultimabase ^2.0.0; this is ultimabase 1.4.0.
```

and a plugin without a kernel range is visible at once:

```text
10:42:07 WARN  [ultimabase] ultimabase-archive declares no ultimabase range.
```

Why: at `start` every plugin is known, as for `requires`; the error is the
developer's first line, not a bug report. A missing range is common in a
plugin's first draft, and refusing it would block a plugin for a field the
author forgot rather than a real conflict.

Rejected: the check in `defineApp` (a missing requirement is refused at
`start`, and both checks belong together); strict ranges without
prereleases (a beta kernel would refuse every plugin); refusing a plugin
without a kernel range (a warning tells the same without blocking);
a hand-written range parser (D-92).

## D-96: `@ultimabase/soft-delete`

Choice: the package of D-17 and D-68, written with the parts of D-89. It
replaces D-89's example where they differ.

1. `softDelete()` adds `deletedAt`, an optional date, to each model that
   uses it. A caller other than Master can write it only to `null`, so a
   row is deleted through `delete` and its access rule, never through an
   `update` of the date.
2. `delete` keeps the row and dates it, after the model's `delete` rule and
   `beforeDelete` hooks; the application's `afterDelete*` hooks still run
   (D-89). Every ordinary read, Master's included, leaves it out (D-17).
3. `Post.trash` reads the deleted rows: `findMany`, `findFirst`,
   `findUnique` and `count`, under the model's read rule.
4. `Post.restore({ where }, { as })` brings a deleted row back under the
   model's `update` rule: Master passes, a caller needs the rule. A row
   that is not deleted is `NOT_FOUND`.
5. No options: the field is `deletedAt`. Purging the trash comes later.
6. The kernel exports the `Queries` type, with which a plugin types its
   commands; each query takes `this: void`, since it is a closure on its
   model and can be passed unbound (`findMany: queries.findMany`).
7. A package's `package.json` gives `ultimabase` a plain range in
   `peerDependencies` (`^0.0.0`) and `workspace:*` in `devDependencies`
   only: Yarn replaces `workspace:^` only when it publishes, so the
   imported manifest would hold a range `definePlugin` refuses (D-95).
   Every package of the repository is published at the kernel's version,
   which extends D-95's rule beyond `@ultimabase/testing`; a test checks
   both.

Why:

1. A caller allowed to update but not to delete could otherwise delete by
   writing the date, and a plain `update` cannot restore either, since it
   no longer finds the row.
2. D-17.
3. The trash is read, not written: `Post.trash.create` would create a row
   outside the trash, `Post.trash.delete` would date it again.
4. D-89's `restore` ran as Master whatever the caller, so any code that
   passed a user's caller restored with no rule.
5. Nothing asks for a field name or a purge delay; each can be added when
   one does.
6. Without it, a plugin's command types repeat the kernel's.
7. `ultimabase 1.4` with `@ultimabase/* 1.4` is one rule to read, as in
   Babel or Angular.

Rejected: `trash: queries` with every query; `restore` as Master; the
options of D-57's example (`field`, `purgeAfterDays`); `workspace:^` in
`peerDependencies`.

Limit: a deleted row keeps its unique values, so creating a row with the
same `title` fails with `UNIQUE_VIOLATION` until the trash is purged.

Example:

```ts
// Before: Parse, a flag every query must remember
Parse.Cloud.beforeFind('Post', ({ query }) => {
	query.notEqualTo('deleted', true)
})
await post.save({ deleted: true }) // any caller allowed to save deletes

// After
import { softDelete, softDeletePlugin } from '@ultimabase/soft-delete'

export const Post = defineModel({ name: 'Post', fields, use: [softDelete()] })
const app = defineApp({ database, models, plugins: [softDeletePlugin()] })

await Post.delete({ where: { id } }, { as: caller }) // the delete rule
await Post.findMany({}, { as: master }) // without it
await Post.trash.findMany({}, { as: caller }) // the deleted posts
await Post.restore({ where: { id } }, { as: caller }) // the update rule
await Post.update(
	{ where: { id }, data: { deletedAt: new Date() } },
	{ as: caller },
)
// PublicError ACCESS_DENIED, path ['deletedAt']
```

## D-97: The typing benchmark measures the packages

Choice: the prototype in `bench/typing/prototype` imports the packages the
way an application does and keeps stand-ins only for what later phases build.

1. Its examples and the generated projects import public names only, from
   `ultimabase` and `@ultimabase/soft-delete`. A plugin's field type (D-32)
   needs `ScalarOptions`, which the kernel now exports.
2. `defineFunction` (Phase 4), `postgres()` (Phase 3), auth (Phase 5), ACL
   (Phase 7) and GraphQL (Phase 4) stay declared stand-ins, each naming its
   phase. Their types may reach kernel internals; the exports they need are
   decided in their phase.
3. The prototype is its own TypeScript project (`bench/typing/tsconfig.json`).
   Its `Register` (D-62) declares a user model; in the root project it also
   reached the packages' tests, which act as a user without one.
   `bench/typing/tsconfig.loose.json` checks it again with
   `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` off, as most
   applications have them, so the types hold there too; `strict` stays
   required (amended 2026-10-25).
4. `asUser(user)` (D-80) takes the record `caller.user` has: the registered
   user model's, or `{ id }` without one. It returns a frozen user caller.
   The kernel and soft delete take `@ultimabase/testing` as a devDependency;
   both resolve the same kernel source, so `master` stays one object.

Why: the benchmark must measure what developers import, not a copy of it;
and a test helper typed against one application's user model would refuse
every other application's tests.

Rejected: the kernel's `defineFunction` types now, without its runtime; an
`asUser` that takes `{ id }` everywhere, which a rule reading
`caller.user.email` would see as a string that is `undefined`; importing the
testing package by a relative path.

Example:

```ts
// Before: each kernel test file
const isCaller = (value: unknown): value is Caller =>
	typeof value === 'object' && value !== null
function user(id: string) {
	const as: unknown = { kind: 'user', user: { id } }
	if (!isCaller(as)) throw new Error('A caller is an object.')
	return { as }
}
await Note.create({ data }, user('ada'))

// After
import { asUser } from '@ultimabase/testing'

await Note.create({ data }, { as: asUser({ id: 'ada' }) })
// With a registered user model, the whole record: asUser(bob) (D-80).
```

## D-98: The PostgreSQL adapter's tables, names and test setup

Amended by D-105.

Choice:

1. Tables. `start` refuses a server below PostgreSQL 15 (D-50). When the
   database holds none of the schema's tables, it creates them all in one
   transaction, which is D-26's case of new tables. Any other state is synced,
   checked or refused as D-105 says (amended 2026-10-22).
2. Columns:
   - `id uuid primary key`, with `created_at` and `updated_at` as
     `timestamptz not null`.
   - string is `text collate "C"`, the order `memory()` mimics.
   - number is `double precision`, boolean is `boolean`, date is `timestamptz`
     (D-65).
   - json is `jsonb`, so two values are equal when their content is.
   - enum is `text` with `check (column in (...))`.
   - A stored `one` is an indexed `<field>_id uuid` column (`dbName` names the
     whole column, D-63). Its foreign key to the target's id has no
     `on delete`, because the kernel runs the cascades (D-54). The check is
     deferred to the commit, because a write may delete a parent before it
     updates the parent's children.
   - An optional field is nullable; every other field is `not null`.
   - Unique fields, unique indexes and the key of a one-to-one are unique
     constraints, checked at once.
   - A condition on `id` with a string that is not a lowercase UUID matches
     no row, as in `memory()`, instead of failing in PostgreSQL.
3. Many-to-many. The join table is named `<table>_<field>` after the side
   whose table name sorts first (amended 2026-10-24: not its model name, so
   a model renamed with its `dbName` keeps its join and its links), and its
   columns are named `<table>_id`. So `Book.tags` with `Tag.books` gives
   `book_tags(book_id, tag_id)`, with a primary key on both columns and an
   index on the second. A relation of a model to itself is named after the
   field that sorts first, and each column after the field that lists its
   ids. So `User.followers` with `User.following` gives
   `user_followers(followers_id, following_id)`. The join's foreign keys
   cascade, so a deleted row's links go with it, as in `memory()`.
4. Constraint names:
   - `<table>_pkey`, `<table>_<columns>_key`, `_fkey`, `_check` and `_idx`.
   - A name over 63 bytes keeps its first 54 and ends with 8 hex characters
     of its hash.
   - When `<table>_pkey` or a `_key` refuses a write, the adapter reports
     `UniqueViolation` with the model's field names.
   - Two things stored under one name are refused, naming both: two tables
     (a model's or a join table), two keys, checks or indexes in the schema,
     or two columns of a table. `start` refuses before it connects, and so
     does a snapshot (amended 2026-10-24).
5. Round-trip counts. `testAdapter(name, create, { roundTrips })` requires
   a counter and runs the counts of D-46 and D-48, so no adapter passes the
   contract without them (D-99).
   - PostgreSQL counts the statements Kysely logs, BEGIN, COMMIT and
     ROLLBACK included. It counts through an internal factory that
     `postgres()` wraps, so nothing public is added.
   - `memory()` counts the calls it receives, `begin`, `commit` and
     `rollback` included.
6. One schema per test. The test creates `t_<id>` and adds
   `?options=-c search_path=t_<id>` to the URL; `postgres()` takes no
   `schema` option.
7. Where PostgreSQL runs:
   - `compose.yaml` runs PostgreSQL 15 and 18.
   - `yarn test:postgres` runs the suite on each space-separated URL of
     `TEST_DATABASE_URL`, and on both compose services by default.
   - CI runs the same two servers as service containers in one job, so
     coverage counts both.
8. `@ultimabase/postgres` has a budget of 3,000 lines through Phase 3; the
   previous plugin had 9,500. `yarn test:postgres` measures its coverage
   against the floor of D-85, and `yarn test` leaves it out.

Why:

- Starting on an empty database is the only migration that needs no diff.
- The `C` collation and `jsonb` give PostgreSQL the comparisons `memory()`
  has, strings by code point (D-94, amended 2026-10-24), so the contract
  holds on both.
- A foreign key keeps hand-written SQL honest without running the kernel's
  cascades a second time.
- A schema per test is faster than a database per test, and isolates the
  tests just as well.

Rejected:

- Native enum types: adding a value takes `alter type`, and a value cannot
  be removed.
- `on delete` actions, which would run the cascades a second time (D-54).
- Immediate foreign keys.
- Text ids, which take 36 bytes where a `uuid` takes 16.
- A `schema` option.
- testcontainers, a dependency for what `compose.yaml` does (D-92).

Example:

```ts
import { postgres } from '@ultimabase/postgres'

const app = defineApp({
	database: postgres({ url: 'postgres://localhost/shop' }),
	models: [Book, Tag],
})
await app.start()
// create table "book" ("id" uuid primary key, "title" text collate "C"
//   not null, "author_id" uuid not null, "created_at" timestamptz not null, ...)
// create table "book_tags" ("book_id" uuid not null, "tag_id" uuid not null,
//   primary key ("book_id", "tag_id"))
```

## D-99: A write in one statement, checked inside it, in a transaction only when one serves

Amended by D-104.

Choice:

1. Checks. `Write.checks` lists the counts a write needs before it changes
   anything, `{ model, where, count }`. The adapter runs them first, in the
   write's statement; when one finds another count, nothing is written and
   the adapter throws `CheckFailed` with that check's index, which the kernel
   reports as `NOT_FOUND`. The kernel checks the ids each `connect` names
   (D-86), and the row an update targets when it does not load it (point 5).
2. Locks. `Read.lock` locks the root rows until the transaction ends:
   `for update` on PostgreSQL; `memory()` ignores it, since its transaction
   holds the write lock. The kernel locks the rows it decides a write from:
   the row an `update` or a `delete` targets, the rows a relation write
   changes from the other side, the rows a cascade loads (D-90).
3. One statement. PostgreSQL runs a write as one statement:
   - each change is a data-modifying CTE that runs only when every check
     passed;
   - the read sees the changes through CTEs named as the written tables,
     which put the changed rows in place of the stored ones, so the read
     compiler is the one of D-46;
   - a change that writes a table the statement already writes (inserts
     into the same table, and a join table's distinct pairs (D-101),
     aside), or that reads one through its filter, starts a new statement,
     since the parts of one statement see the database as it was; several
     statements run in one transaction.
4. A transaction only when one serves. The kernel begins a write's
   transaction with its first query, so a write that queries nothing before
   its changes begins none: its changes go to the adapter's own `write`,
   atomic alone, when nothing follows them (no `after*` or `*Commit` hook,
   no read again). Inside `transaction()`, every query runs in it.
5. Fewer reads. The kernel loads no row when Master updates by `id` a model
   without update hooks: the check `{ where: and(where, readable), count: 1 }`
   stands for it, and an empty read after the update is `NOT_FOUND` (D-104,
   amended 2026-10-25). A relation written from the other side, on a model
   without update hooks and without rules for the caller, is one update
   `where: and(where, filter)` instead of a read and an update.
6. A connected id that is not a UUID is `NOT_FOUND` before any query: the
   kernel makes every id (D-22), so no row has it, and PostgreSQL would
   refuse it as a `uuid` before a check could.
7. The contract suite counts round trips, BEGIN, COMMIT and ROLLBACK
   included: `testAdapter(name, create, { roundTrips })` (D-98).
8. A race the checks miss (amended 2026-10-24). A connect check takes no
   lock, so a concurrent delete can commit between it and the COMMIT, where
   PostgreSQL's deferred foreign key refuses the write. The adapter throws
   `RelationViolation(model, field, target, restricted)` for a foreign key
   it knows, and the kernel reports what the checks would have reported in
   either order: `NOT_FOUND`, "A connected Genre does not exist.", for a
   target deleted meanwhile; `RELATION_RESTRICTED` (D-54) for a delete a
   row linked meanwhile restricts. PostgreSQL's message alone tells the two
   apart: a server whose messages are not in English reports each one as
   `NOT_FOUND`.

Why:

- A check as its own `count` costs a round trip per connected model, and a
  write that checks inside its statement needs no transaction to undo
  itself: nothing runs when a check fails.
- Without a lock, a concurrent write can change a row between the read that
  allowed a write and the write.
- Most writes in an application are a `create` or a Master `update` with no
  hook: they become one round trip.

Rejected:

- Failing a check by raising inside SQL, as a cast of a message to an
  integer: the error would be PostgreSQL's text, parsed back.
- A transaction around every write.
- Serializable isolation instead of row locks: a conflicting write fails
  and the application retries it.
- Locking each connected row (`for key share`) to rule out the race: a lock
  on every connect for a race a refusal already reports.
- Skipping the read of an update by a unique field other than `id`: the
  read after it follows the row by `id`, which the kernel has not loaded.

Limits:

- A check runs with the write, so its `NOT_FOUND` comes after the errors
  the kernel finds before writing: a Master update of a missing row with
  invalid data fails with `VALIDATION_FAILED`, a connect to a missing row
  after a move refused as `FORBIDDEN`.

Example:

```ts
const novel = await Novel.create(
	{
		data: {
			title: 'Engines',
			writer: { connect: { id: writerId } },
			genres: { connect: [{ id: genreId }] },
		},
	},
	{ as: master },
)
// Before: 7 round trips
//   begin
//   select count(*) from "writer" where "id" = $1
//   select count(*) from "genre" where "id" in ($2)
//   insert into "novel" (...) values (...)
//   insert into "genre_novels" (...) values (...) on conflict do nothing
//   select ... the returned novel
//   commit
// After: 1 round trip
//   with "#checks" as (select
//     (select count(*) from "writer" as "t1" where "t1"."id" = $1) = 1 as "c0",
//     (select count(*) from "genre" as "t2" where "t2"."id" in ($2)) = 1 as "c1"),
//   "#w0" as (insert into "novel" (...) select ... where (select "c0" and "c1"
//     from "#checks") returning *),
//   "#w1" as (insert into "genre_novels" (...) select ... where ... on
//     conflict do nothing returning *),
//   "novel" as (select * from "novel" where "id" not in (...)
//     union all select * from "#w0"),
//   "genre_novels" as (...)
//   select "c0", "c1", (select ... from "novel" as "t3" ...) as "rows"
//   from "#checks"
```

## D-100: A comparison benchmark against other data layers

Choice:

1. `bench/compare` measures UltimaBase beside Prisma, Drizzle and `pg` with
   hand-written SQL, on the same PostgreSQL server, the same tables and the
   same rows: the round trips and the time of each case. Its tables feed the
   comparison the documentation will publish.
2. The cases are the ones every contender has: a create, a create that
   connects a `one` and a `many`, an update by id, a `many` disconnected and
   connected, a delete that cascades to a row, two creates in a transaction,
   a read by id and a read of two levels of relations. Access rules and
   hooks stay out: the others have none.
3. Each contender writes the code its documentation shows, not code tuned
   for the benchmark, and returns what UltimaBase returns: the written row,
   or the rows read with their relations. A cascade is the database's
   `on delete cascade` for the others, which is how they declare it. `pg`
   is the floor: one statement a case, the fewest the case allows.
4. Round trips are counted on the wire, the same way for everyone: a proxy
   between the client and PostgreSQL counts each query the client sends
   (`Query` messages, and `Sync` for the extended protocol). Every contender
   uses `pg` underneath, Prisma through `@prisma/adapter-pg`.
5. The benchmark is its own Yarn project with its own lockfile, outside the
   workspaces: Prisma and Drizzle never enter the packages' dependencies,
   and `yarn validate` neither installs nor type-checks it. Its versions are
   pinned exactly and named in each run it records.

Why:

- Developers coming from Prisma or Drizzle (D-01) ask what UltimaBase costs
  them; a table measured on the same server answers, and points at what to
  optimize next.
- Counting on the wire needs no cooperation from a library, so nobody's own
  log decides its score.

Rejected:

- Comparing with the numbers other projects publish: other machines, other
  cases.
- Counting with `pg_stat_statements` or PostgreSQL's log: the first needs
  the server configured, the second parsing, and neither sees BEGIN and
  COMMIT the way a client pays for them.
- Adding Prisma and Drizzle to the repository's dependencies (D-92): they
  remove no code of ours.

## D-101: A join table's distinct pairs change in one statement

Choice: on PostgreSQL, the links and unlinks of a join table share one
statement when no pair appears in two of them, whichever side names the
pair; a pair changed twice starts a new statement, as any table written
twice does (D-99). A `disconnect` and a `connect` of the same id stay
allowed: the row is disconnected, then connected, as on `memory()`.

Why: moving a `many` relation, the commonest relation write after
`connect`, took BEGIN, two statements and COMMIT, four round trips, while
its delete and its insert never touch the same row. The adapter sees the
pairs, so it needs no rule from the kernel.

Rejected: refusing a `disconnect` and a `connect` of the same id as
`INVALID_QUERY`: the adapter already orders them, and the refusal would be
one more rule for developers to learn.

Example:

```ts
await Novel.update(
	{
		where: { id: novelId },
		data: { genres: { disconnect: [{ id: tale }], connect: [{ id: saga }] } },
	},
	{ as: master },
)
// Before: 4 round trips
//   begin
//   with "#checks" as (...), "#w0" as (update "novel" ...),
//     "#w1" as (delete from "genre_novels" ... returning *) select ...
//   with "#w2" as (insert into "genre_novels" ... returning *),
//     "novel" as (...), "genre_novels" as (...) select ... as "rows"
//   commit
// After: 1 round trip
//   with "#checks" as (...), "#w0" as (update "novel" ...),
//     "#w1" as (delete from "genre_novels" ... returning *),
//     "#w2" as (insert into "genre_novels" ... returning *),
//     "novel" as (...), "genre_novels" as (select * from "genre_novels"
//     where (...) not in (select ... from "#w1") union all select * from
//     "#w2")
//   select "c0", (...) as "rows" from "#checks"
```

## D-102: A delete whose reach runs no hook is one write, its rows unloaded

Amended by D-104.

Choice:

1. When no model a `delete` reaches has delete hooks or a `redirect`, no
   `setNull` model has update hooks, and no cascade comes back to a model
   it left, the kernel loads no row of the reach. Each level is a filter on
   the one above, from the root's `where`, `{ author: { is: … } }`:
   - a `cascade` model is deleted by its filters, the deepest model first;
   - a `setNull` relation empties its key and moves `updatedAt` on the rows
     its filter reaches that the delete leaves;
   - a `restrict` relation is a check with a count of 0 on those rows, which
     fails as `RELATION_RESTRICTED`, naming the model and the field (D-90).
2. Master's `delete` by any unique `where` is then one write: a check that
   the row exists, the `restrict` checks, the changes, and the row read as
   it was. A user's `delete` loads its row for the access rule, then writes
   the same way.
3. `Write.before` asks the adapter for the rows of the read's model that
   the write's delete of that model removed, as they were (amended
   2026-10-25, D-104). PostgreSQL reads them from that delete's RETURNING,
   in its statement, without the views of D-99; `memory()` reads before
   the changes and keeps the rows gone after them.
4. Any other delete loads its reach level by level, as D-90 says.

Why: a delete with a cascade took one `SELECT ... FOR UPDATE` per level on
top of the four round trips of a loaded delete, while nothing in it needed
the rows: the database finds them inside the statement, and deferred keys
(D-98) let the parents and the children go in any order. The hooked path
keeps its loads, since its hooks receive the records.

Rejected:

- the database's `on delete` actions, which would run the cascades a second
  time when a hook needs them (D-54);
- a recursive read (`WITH RECURSIVE`) for the hooked path: it saves round
  trips only on deep reaches, and needs a new adapter call; it stays a
  "Later" of D-90.

Limit: a cascade that comes back to its own model, a tree, still loads its
rows, since a filter cannot say how deep the tree goes.

Example:

```ts
const Novel = defineModel({
	name: 'Novel',
	fields: (f) => ({
		title: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade' }),
	}),
})

await Writer.delete({ where: { id: writerId } }, { as: master })
// Before: 5 round trips
//   begin
//   select ... from "writer" where "id" = $1 for update
//   select ... from "novel" where "writer" in ($1) for update
//   with "#w0" as (delete from "novel" where "id" in (...)),
//     "#w1" as (delete from "writer" where "id" in ($1)) select 1
//   commit
// After: 1 round trip
//   with "#checks" as (select (select count(*) from "writer"
//     where "id" = $1) = 1 as "c0"),
//     "#w0" as (delete from "novel" where "writer" in (select "id" from
//     "writer" where "id" = $1) and (select "c0" from "#checks")),
//     "#w1" as (delete from "writer" where "id" = $1 and (...))
//   select "c0", (select ... from "writer" where "id" = $1) as "rows"
//   from "#checks"
```

## D-103: A write reads the one row it changes from its RETURNING

Choice:

1. When a write's read selects one row by `{ id: { equals } }` alone, and
   the statement it runs in has exactly one change on that row's table, an
   insert of that row or an update of it by id, PostgreSQL takes the root
   row from that change's CTE, `from "#w0"`, rather than from the table's
   view (D-99).
2. The table's view is then left out, unless the read comes back to the
   table through a relation, which still sees the change through it.
3. Any other read keeps the views of D-99.

Why: the view is a `union all` the planner works through on every write,
for a row the change already returns. On PostgreSQL 18, a 10 000-row table,
3 000 runs, the median round trip of a create went from 0.57 to 0.50 ms and
of an update by id from 0.69 to 0.58 ms; planning a create went from 0.19 to
0.05 ms. A view left in place without being read still cost 0.02 ms.

Rejected: building the row with `jsonb_build_object` straight from the CTE,
without the list and its `row_number`: 0.05 ms faster on a create, but a
second way to compile a read, for one row.

Example:

```ts
await Genre.create({ data: { label: 'myth' } }, { as: master })
// Before
//   with "#w0" as (insert into "genre" (...) values (...) returning *),
//     "genre" as not materialized (select * from "genre"
//       union all select * from "#w0")
//   select (select ... from "genre" as "t1" where "t1"."id" = $5) as "rows"
// After
//   with "#w0" as (insert into "genre" (...) values (...) returning *)
//   select (select ... from "#w0" as "t1" where "t1"."id" = $5) as "rows"
```

## D-104: A write answers from the rows it changed; a user's write locks its row

Choice: amends D-99 point 5 and D-102 point 3 (amended 2026-10-25: the
first D-104 read a user's row without a lock and checked it unchanged in the
write; it is withdrawn, see Why and Rejected).

1. A user's `update` or `delete` locks the row it targets, as D-99 point 2
   says, inside `transaction()` or not: BEGIN, the `select ... for update`,
   the rules, `prepared` and the `before*` hooks, the write, COMMIT.
2. A write that loads no row answers from the rows its changes wrote, not
   from its checks:
   - Master's `update` by `id` (D-99 point 5) is `NOT_FOUND` when its read
     comes back empty: the row went between the check and the update.
   - `Write.before` (D-102 point 3) returns the rows of the read's model
     that the write's delete of that model removed, as they were.
     PostgreSQL reads them from that delete's RETURNING, in its statement;
     `memory()` reads before the changes and keeps the rows gone after
     them.
   - Master's `delete` by a unique `where` is then `NOT_FOUND` when its
     delete removed nothing, and `deleteMany` counts the rows it removed.

Why:

- A check runs on its statement's snapshot. Under READ COMMITTED, an update
  or a delete that waits on a row another transaction holds checks its own
  `where` again once that one commits, but not the check, which PostgreSQL
  computes once for the statement. The first D-104 therefore wrote a row its
  rules never saw: another request gave Alice's locker to Bob, and Alice's
  update, allowed from the row as it was, changed Bob's locker (PostgreSQL
  15 and 18).
- For the same reason, a check or a read before the changes counts rows
  another transaction deleted meanwhile: `deleteMany` reported 2 rows it
  never removed, a `delete` returned a row someone else removed, so a token
  could be redeemed twice, and a Master `update` returned `null`. The rows a
  change returns are the ones it wrote. Prisma answers the same way: its
  `deleteMany` count is the database's count of affected rows, and its
  `update` and `delete` fail with `P2025` when no row was written.
- The lock is the simplest guarantee to reason about: the rules decide from
  a row nobody else changes until the write commits.

Cost: a user's update or delete under rules is 4 round trips again, 1.91 ms
for an update and 1.70 ms for a delete on PostgreSQL 18, where the first
D-104 took 2 round trips, 1.39 and 1.19 ms (`bench/writes`).

Rejected:

- The first D-104, reading the row without a lock and checking it unchanged
  in the write: unsafe under concurrency, as above.
- Locking inside the check (`select ... for update` in `#checks`): it held
  in the probe and keeps 2 round trips, but it rests on how PostgreSQL
  re-checks a statement that waited on a lock, and keeps a second way of
  deciding a write for every model under rules.
- PostgreSQL's `xmin` as a row version: it would be checked on the same
  snapshot.
- Serializable isolation, as D-99 rejects it.

Example:

```ts
// Alice owns the locker; meanwhile, another request gives it to Bob.
await Locker.update({ where: { id }, data: { label: 'b' } }, { as: alice })
// Before: allowed from Alice's row, written on Bob's.
// After: waits for the other request, then ACCESS_DENIED; Bob's row stays.

// Meanwhile, another request deletes both tickets.
await Ticket.deleteMany({}, { as: master })
// Before: { count: 2 }
// After: { count: 0 }
await Ticket.delete({ where: { code: 'A' } }, { as: master })
// Before: the ticket, as if this call removed it
// After: NOT_FOUND
await Ticket.update({ where: { id }, data: { label: 'x' } }, { as: master })
// Before: null
// After: NOT_FOUND
```

## D-105: `ultimabase.config.ts`, the `ultimabase` commands and a schema snapshot

Choice: amends D-26, D-73 and D-98 point 1.

1. The application lives in `ultimabase.config.ts`, at the project's root,
   whose default export is what `defineApp` returns. It stays the one file of
   D-24, and Next or Vite users find it where they expect a configuration.
   The `ultimabase` binary loads it from the working directory, or from
   `--config <path>`; `.ts`, `.mts`, `.js` and `.mjs` are looked for in that
   order. Node loads it natively, so it and what it imports use erasable
   TypeScript and `.ts` import extensions. Importing it starts nothing.
   `ultimabase dev` and `ultimabase start` start it, as `next dev` and
   `next start` do; a process of the developer's own imports it and calls
   `start()` (D-59) instead:
   - `ultimabase dev` sets `NODE_ENV` to `development` when it is unset, and
     restarts the application when a file it imports changes, through
     Node's `--watch`;
   - `ultimabase start` sets `NODE_ENV` to `production` when it is unset, so
     a deployed server is never in development by omission (D-49);
   - both start the application and leave `SIGTERM` to it (D-59).
2. A snapshot describes what the storage adapter makes of the models: for
   PostgreSQL, every table with its columns, types, constraints and indexes.
   It is JSON, and its hash is the SHA-256 of its canonical form. Two places
   keep one, each for its own question:
   - every database holds `ultimabase_schema`, one row with the snapshot its
     tables match and whether development sync or `migrate deploy` wrote it,
     as Parse's `_SCHEMA` describes its database;
   - the repository holds `migrations/schema.json`, the snapshot the
     committed migrations lead to, which `migrate create` compares with.
     It is committed with the SQL files. Git may merge two branches' changes
     to it without a conflict; the guard is the last file's header, which
     must name the models' hash (point 6): after such a merge, deploy
     refuses until `migrate create` writes a file, empty when the merged
     files already lead to the models, with the right header (amended
     2026-10-22).
3. Development is any `NODE_ENV` but `production`, as for the master key
   (D-49). There, `start` compares the models with the database's snapshot.
   An empty database gets every table; a change that loses no data is
   applied, all in one transaction under an advisory lock, and logged
   (`Synced Locker: added owner.`). Losing no data means a new table,
   column, index or enum value; a dropped index or constraint; a field made
   optional. A new required field, unique index or `one`, a field made
   required and a removed enum value are tried: the database refuses them
   when a row breaks them, and nothing is applied. Sync changes the tables'
   shape only and never moves data; a refused change names the statement,
   what it tried and the database's reason (amended 2026-10-22):

   ```
   UltimaBase did not sync Locker: adding the required "Locker.kind" fails when Locker holds rows.
     alter table "locker" add column "kind" text collate "C" not null;
     -- column "kind" of relation "locker" contains null values
   Fix those rows in this development database, or rebuild it from the migrations with `npx ultimabase reset`.
   In production, a migration fixes them: write it with `npx ultimabase migrate create <name>`.
   ```

   Any other change, a drop,
   a type change and anything that could be a rename, stops `start` with
   its SQL and the commands that apply it:

   ```
   UltimaBase did not sync Locker: removing "Locker.label" deletes data.
     alter table "locker" drop column "label";
   Run `npx ultimabase sync --force` to apply it to this development database,
   or `npx ultimabase migrate create <name>` to write it as a migration.
   ```

   A removal that may be a rename says how to keep the data in development,
   `-- a rename? keep its data: give Locker.title dbName: 'label'.`, and a
   migration file gets the SQL instead (point 5; amended 2026-10-22).

   A database that holds tables but no snapshot is refused.

4. In production, `start` applies nothing. It reads the database's snapshot
   hash, one query, and refuses to start, naming `migrate deploy`, when it
   differs from the models' hash or when the database has no snapshot. A
   database ahead of the models is accepted: code rolled back after a
   deploy, or the old code of a rolling deploy, finds the models' hash in
   the header of an applied file followed by others, and starts with
   `The database is ahead of the models: 20261022143000_add_kind.sql was applied after them.`
   (amended 2026-10-22).
5. `ultimabase migrate create <name>` compares the models with
   `migrations/schema.json`, or with nothing when there is no migration yet,
   and writes `migrations/<UTC yyyyMMddHHmmss>_<name>.sql`, then the new
   snapshot. It needs no database. The file starts with
   `-- ultimabase schema <hash>`; a statement that loses data is preceded by
   a comment saying what it deletes, and a column dropped beside a column
   added to the same table with the same type gets
   `-- a rename? write: alter table ... rename column ...`. A tried
   statement is preceded by what it tries,
   `-- limiting "Locker.kind" to wood, glass fails when a row holds another value.`,
   where a data migration goes. The file is edited by hand when the plan is
   not what the developer meant, and that is how data moves: an `update`
   between the generated statements. When no model changed, the file holds
   only its header and `-- No model changed: write your SQL here.`, for a
   migration of data alone. SQL files without `schema.json` are refused
   (amended 2026-10-22).
6. `ultimabase migrate deploy` applies, in name order, the files that
   `ultimabase_migrations` (name, checksum, applied at) does not list, each
   in its own transaction, under an advisory lock, then writes the models'
   snapshot to `ultimabase_schema`. Before applying anything, it refuses:
   - when the last file's hash differs from the models' hash: the models
     changed since the last `migrate create`;
   - when an applied file was edited or removed;
   - when development sync wrote the database's snapshot: migrations apply
     to a database only migrations built;
   - when a file is pending while the database applied files after it that
     `migrations/` does not hold: older code adds a migration to a database
     newer code migrated.

   In development each refusal adds
   `Restore the dump you test on, or rebuild this database from the migrations with \`npx ultimabase reset\`.`
   A database ahead of the files, whose applied files after the last local
   one are all missing, is left as it is: deploy prints the ahead line of
   point 4 and stores nothing.

   Each file runs with `set local lock_timeout = '5s'`, so a deploy waiting
   behind a long query fails instead of queueing every query behind it; a
   file sets its own with `set local lock_timeout`, and a timeout reads
   `... was not applied: canceling statement due to lock timeout: another query held a table it changes past lock_timeout`.
   Files are read with their line endings normalized to `\n`, so a Windows
   checkout changes neither checksum nor header.

   A file whose second line is `-- ultimabase no transaction` runs outside a
   transaction, for what PostgreSQL refuses in one, such as an index built
   on a large table without blocking its writes:

   ```sql
   -- ultimabase schema 3f2a…
   -- ultimabase no transaction
   create index concurrently "locker_label" on "locker" ("label");
   ```

   It holds one statement, since PostgreSQL runs several sent together in
   one transaction; two read
   `... cannot run inside a transaction block: a file without a transaction holds one statement: put each in its own file`,
   and the same statement in an ordinary file reads
   `...: put it in its own file, whose second line is \`-- ultimabase no transaction\``.
It runs under the advisory lock taken for its session and with no
`lock_timeout`: `create index concurrently`waits for running
transactions without blocking any, and one that fails leaves an invalid
index. A failure then reads`It ran without a transaction, so nothing was rolled back: undo what it left, such as an invalid index, then deploy again.`

   A file the database refuses is rolled back, the files before it stay
   applied, and deploy names it with the database's reason:
   `20261022143000_add_kind.sql was not applied: column "kind" of relation "locker" contains null values`,
   then `The database rolled it back: fix it, then deploy again.` (amended
   2026-10-22).

7. `ultimabase sync [--force]` runs development sync without starting the
   application; `--force` also applies what loses data. Both are refused in
   production.
   - `ultimabase migrate status` says what deploy would do or refuse,
     without applying anything: each pending file, the refusals of point 6,
     the ahead line, or `The database is up to date.`. It exits 1 when there
     is anything to do, so CI can gate a deploy on it.
   - `ultimabase reset` drops every table of a development database but an
     extension's, such as PostGIS's `spatial_ref_sys`, then
     applies every migration file and stores `schema.json`'s snapshot, as a
     deploy would; with no file, the next start builds the tables. It is
     refused in production and asks nothing (amended 2026-10-22). A
     database on another machine, a host the kernel's `isLocalHost` does
     not call local, needs `reset --force`: `NODE_ENV` unset on a laptop
     holding a production `DATABASE_URL` would otherwise wipe it. A unix
     socket and an empty host are this machine; the adapter reads the host
     as its driver does (amended 2026-10-24). `postgres()` takes an unset `url`,
     as `process.env.DATABASE_URL` may be, and refuses it when the app
     starts, never while the config is imported (amended 2026-10-25).

8. The adapter contract (D-73) gains an optional `migrations` member, which
   the kernel's commands and `start` call; `memory()` has none, since it
   starts empty every time, and the commands say so:

   ```ts
   interface Migrations {
   	/** What this database makes of the models, JSON it validates on read. */
   	snapshot(schema: Schema): unknown
   	/** The statements from one snapshot to another; none is an empty database. */
   	plan(from: unknown, to: unknown): readonly Statement[]
   	/** The database's snapshot, and who wrote it. */
   	stored(): Promise<Stored | undefined>
   	/** Runs statements or files, each file in its transaction, then stores
   	 * `to`; throws `MigrationFailed` naming what the database refused. */
   	apply(run: Run): Promise<void>
   	/** Drops every table; returns the models' ones it dropped. */
   	reset(): Promise<readonly string[]>
   	/** The database's host when it is not on this machine: `reset` then
   	 * needs `--force` (amended 2026-10-24). */
   	readonly remote?: string
   }
   class MigrationFailed extends Error {
   	/** The statement's SQL, or the file's name. */
   	readonly at: string
   	readonly reason: string
   }
   interface Statement {
   	readonly sql: string
   	/** For the log: `Synced Locker: added owner.` */
   	readonly model: string
   	readonly does: string
   	/** What it deletes, when it loses data. */
   	readonly loses?: string
   	/** What makes the database refuse it, when rows can. */
   	readonly tries?: string
   	/** A removal that may be a rename: `Locker.title`, `label`, its SQL. */
   	readonly rename?: { to: string; dbName: string; sql: string }
   }
   type Run =
   	| {
   			kind: 'sync'
   			from: unknown
   			statements: readonly Statement[]
   			to: unknown
   	  }
   	| { kind: 'deploy'; files: readonly Migration[]; to: unknown }
   ```

   A sync's `from` is checked under the lock, so two processes syncing the
   same database apply its statements once. `Stored.snapshot` is undefined
   when a deploy stopped before storing one. The snapshot names the models
   and fields, so a rename that keeps its `dbName` changes the hash with no
   statement: `migrate create` writes a file that says so, and deploy stores
   the new snapshot (amended 2026-10-22).

   A `Migration` is a file's `name`, `sql`, `checksum`, the `schema` hash
   its header names and whether it runs in a `transaction`; `Stored.applied` lists each applied file's `name`,
   `checksum` and `schema`, which the ahead check of point 4 reads.

   `start(schema)` only connects; the kernel then syncs or checks. The
   PostgreSQL package implements `Migrations`; the binary reads and writes
   the files.

Why:

- In development the database follows the models by itself, so it cannot
  tell `migrate create` what changed: the reference has to be the
  repository's. Production's database is not reachable from a laptop, and
  should not be.
- A snapshot is compared with a pure function, the same one for sync and
  for `migrate create`, testable without a database. Reading
  `information_schema` back would need a database to write a file.
- Comparing a hash keeps a production start at one query.
- A drop and an add cannot be told from a rename; a comment in a file the
  developer reviews asks the question without an interactive prompt, so CI
  can run it.
- A field renamed in code keeps its column with `dbName` (D-63), at no cost.

Limits:

- A plugin's data migration has no place yet: a plugin changes its models,
  and the application's `migrate create` writes the SQL, but a plugin
  cannot ship the `update` that moves its data. It waits for a plugin that
  needs one.
- Adopting an existing database, such as Parse's, is out of scope: a
  database that holds tables but no snapshot is refused (point 3).
- A change made by hand to a deployed database goes unseen: deploy and
  start compare hashes and never read the tables back. A
  `migrate status --verify` that compares them is the direction, when a
  team needs it.
- Code that reads a column a later migration drops fails while both run,
  in a rolling deploy or after a rollback. A drop ships in the deploy
  after the code stopped reading it: add first, remove later.
- Data migrations are SQL; a migration written in TypeScript waits for an
  application that needs one.
- `migrate squash` is the direction for a long history: it writes one file
  from nothing to `schema.json`, whose header lists the files it replaces,
  and deploy marks it applied on a database that applied them all. It waits
  for an application whose history needs it.

Rejected:

- A separate configuration file beside the application's: two files to read
  to know how it is set up (D-24).
- A config file found by `package.json` or by searching parent directories.
- The snapshot only in the database, as Parse does: Parse has no migration
  files, and no database knows what the committed migrations lead to.
- A shadow database that replays the migrations to compare with (Prisma):
  a database needed to write a file.
- One snapshot per migration file (Drizzle's `meta/`): branches that each add
  one no longer conflict, and the second migration is written from the
  wrong snapshot.
- Asking on the terminal whether a change is a rename.
- Loading the configuration through a TypeScript loader such as `jiti`, for
  extensionless imports: a dependency the starter does not need (D-92), to
  revisit if users ask.
- Applying migrations at startup in production.
- Adopting a database sync changed, or rewinding it to the migrations: a
  second bookkeeping for a development copy that a dump or `reset` rebuilds
  in seconds.
- Down migrations: a rollback is a new migration, as with Prisma.
- Asking before `reset`: it is refused in production, and needs `--force`
  for a database on another machine.
- Marking a development database, as Rails stores its environment: a dump
  of production restored for a test carries production's mark.
- A command that runs arbitrary SQL: `psql` does it.

Limits:

- A change made by hand in SQL is invisible to both snapshots.
- A tried change can still fail in production, on rows a development
  database does not have; `migrate deploy` then stops at that file, its
  transaction rolled back. `migrate deploy` on a restored dump tests it
  first.
- Each file runs in a transaction, so `create index concurrently` cannot be
  written in one.
- `reset` drops tables, not the types or functions a file created.

Example:

```ts
// Before: Parse Server, the schema lives in the server's options and is
// applied, or refused, at every start
new ParseServer({
	schema: {
		definitions: [lockerSchema],
		strict: true,
		deleteExtraFields: false,
	},
})

// After
// ultimabase.config.ts
import { postgres } from '@ultimabase/postgres'
import { defineApp } from 'ultimabase'
import { Locker } from './src/locker.ts'

export default defineApp({
	database: postgres({ url: process.env.DATABASE_URL }),
	models: [Locker],
})

// server.ts
import app from './ultimabase.config.ts'
await app.start()
```

```bash
npx ultimabase migrate create add_locker_owner
# migrations/20261022143000_add_locker_owner.sql
#   -- ultimabase schema 3f2a…
#   alter table "locker" add column "owner" text collate "C";
# migrations/schema.json
npx ultimabase migrate deploy
# Applied 20261022143000_add_locker_owner.sql.
```

```bash
# A data migration, tested on a restored dump of production
pg_restore --clean -d "$DATABASE_URL" prod.dump
npx ultimabase migrate create add_kind   # then add the update by hand
npx ultimabase migrate status            # 20261022150000_add_kind.sql is pending. (exit 1)
npx ultimabase migrate deploy            # Applied 20261022150000_add_kind.sql.
# In CI, against production
npx ultimabase migrate deploy && npx ultimabase start
# Back to a clean development database
npx ultimabase reset                     # Dropped locker. Applied ….sql.
# A development database on another host
npx ultimabase reset --force
```

## D-106: `httpPlugin()`, its Hono routes and the caller they read

Choice: completes D-27, D-49, D-59 and D-66.

1. `@ultimabase/http` exports `httpPlugin(options)` and `routes()`. It
   depends on `hono` and `@hono/node-server`, whose server it starts.
   `routes()` is `new Hono<{ Variables: { caller: Caller } }>()`, and a route
   reads `c.var.caller`, typed, and sends it as `{ as: c.var.caller }`
   (D-19). The application passes them as `httpPlugin({ routes: [webhooks] })`;
   each is mounted at the root, in their order.
2. The kernel gives every plugin's `api`, `start` and `stop` an
   `identify(request): Promise<Caller>`, so each transport finds the caller
   the same way:
   - a request with the `x-ultimabase-master-key` header is compared with the
     master key in constant time; a match is Master with
     `caller.master.source === 'key'`; each refusal is logged, and each
     match in production (D-49, amended 2026-10-23);
   - a wrong key, a key sent while none is configured, or any key in
     production without `{ key, production: true }` is refused with
     `ACCESS_DENIED` (403);
   - an empty key is no key: `ULTIMABASE_MASTER_KEY=` must not let an empty
     header in; an empty header while a key is configured is a wrong key
     (403), since the client meant to send one (amended 2026-10-23);
   - a key holding a space or a character outside visible ASCII stops
     `start`: a header drops the spaces around a value and mangles the rest,
     so such a key could never match (amended 2026-10-23);
   - any other request is anonymous, unless a plugin's `identify` knows it:
     auth's reads the session (D-112).
3. Errors follow D-28 and D-72. A `PublicError` is sent as
   `{ code, message, details }`, `details` only when set, with its D-72
   status. Any other error is sent as `{ code: 'INTERNAL', message:
'Internal error.', correlationId }` with status 500, and logged with the
   same `correlationId`. An unknown route is `NOT_FOUND` (404). A body over
   the limit is `PAYLOAD_TOO_LARGE` (413), the HTTP plugin's own code: the
   kernel knows no body.
4. The port is the `port` option, then the `PORT` environment variable, then
   3000; a `PORT` that is not a port stops `start`. The plugin logs
   `Listening on http://localhost:3000.` once it listens. `stop` stops
   accepting connections, closes idle keep-alive connections, and waits for
   the requests still running (D-59) for 10 seconds at most: a stream never
   ends by itself, and an orchestrator kills a process that does not stop
   (Kubernetes after 30 seconds) before pending `*Commit` hooks finish. It
   then closes the connections left and logs a warning; the delay is fixed,
   not an option (amended 2026-10-23).
5. CORS (D-66) and the body limit use Hono's middlewares. `cors` lists the
   allowed origins; outside production, the local origins of D-66 are
   also allowed (amended 2026-10-24: the kernel's `isLocalHost(hostname)`,
   which auth and `reset` use too, tells them). `bodyLimit` is in bytes,
   1 MB by default. Only a preflight, an `OPTIONS` with
   `Access-Control-Request-Method`, is answered by `cors`; any other
   `OPTIONS` reaches its route, with the CORS headers, or `NOT_FOUND`
   (amended 2026-10-23).
6. A browser posts an HTML form to any site with that site's cookies, and
   CORS never stops it. A request that is not `GET`, `HEAD` or `OPTIONS`,
   whose content type a form sends (form-urlencoded, multipart or
   `text/plain`; none counts as `text/plain`) and which carries a `Cookie`
   header, or an `Origin` or `Sec-Fetch-Site` header as every browser does,
   is refused with `ACCESS_DENIED` (403), "A form from another origin is
   refused.", unless its `Sec-Fetch-Site` is `same-origin` or its `Origin`
   is the server's own or one `cors` allows; `Origin: null` is none of
   them. Without cookies, another site's form would sign its visitor in to
   the sender's account through a route that reads JSON from `text/plain`.
   A webhook sends neither header, nor cookies, and passes (amended
   2026-10-24, 2026-10-25).
7. Every response that sets no `Cache-Control`, errors included, is sent
   with `Cache-Control: no-store`; a route's own is kept (amended
   2026-10-25).

Why: Hono is a small router built on the web's `Request` and `Response`,
whose context already carries typed variables, so a route reads the caller
with nothing to learn. Identify belongs to the kernel, since the master key
and the session are the same for HTTP and GraphQL (D-49); a transport only
hands it the request.
`SameSite=Lax` keeps a cookie from another site's form, not from a sibling
subdomain's, which is the same site: point 6 covers it, and GraphQL refuses
forms anyway (D-39). Hono's `csrf` middleware refuses a form without cookies
too, so it breaks form webhooks (Twilio, Slack), and answers in plain text.
A `GET` carries the session cookie, so its response may hold the caller's
data, and a shared cache or the browser's would keep it for the next one
(OWASP's advice). `no-store` rather than `private`: a browser's back button
or disk would still hold a `private` response, and a route that knows its
response is public says so, as
`c.header('cache-control', 'public, max-age=60')`.
Rejected: a `defineRoute` wrapper (D-27); the caller as a function argument
(`(c, caller) => …`), which is not Hono's shape; test helpers, since Hono's
`routes().request(…)` and a server on port 0 already test a route; the API
GraphQL mounts itself with, decided with `graphqlPlugin()`.
Example:

```ts
// Before: Parse, with Express beside it
app.post('/webhooks/stripe', async (req, res) => {
	const query = new Parse.Query('Invoice')
	const invoice = await query.get(req.body.id, { useMasterKey: true })
	res.json({ paid: invoice.get('paid') })
})

// After
import { httpPlugin, routes } from '@ultimabase/http'

const webhooks = routes()
webhooks.post('/webhooks/stripe', async (c) => {
	const { id } = await c.req.json<{ id: string }>()
	const invoice = await Invoice.findUnique(
		{ where: { id } },
		{ as: c.var.caller },
	)
	return c.json({ paid: invoice?.paid ?? false })
})

export default defineApp({
	database: postgres({ url: process.env.DATABASE_URL }),
	plugins: [
		httpPlugin({ cors: ['https://app.example.com'], routes: [webhooks] }),
	],
	models: [Invoice],
	masterKey: process.env.ULTIMABASE_MASTER_KEY,
})
```

```bash
npx ultimabase dev
# Listening on http://localhost:3000.
curl -X POST localhost:3000/webhooks/stripe -d '{"id":"…"}' \
  -H 'x-ultimabase-master-key: wrong'
# 403 { "code": "ACCESS_DENIED", "message": "The master key is wrong." }
```

## D-107: `graphqlPlugin()`, the schema it generates and how it mounts

Choice: completes D-16, D-34, D-41, D-45 and D-55.

1. `@ultimabase/graphql` exports `graphqlPlugin(options)` and the model entry
   `graphql()`. It requires `httpPlugin` (D-16) and depends on
   `graphql-http`; `graphql` is a peer dependency, so the application and the
   plugin share the one instance that `extend` needs (point 9).
2. Mounting. The HTTP plugin's API offers `mount(routes)`, called from another
   plugin's `api`, which the kernel builds before any `start`; a call after
   the server started throws. The application's routes come first, then the
   mounted ones in plugin order, so an application middleware such as a rate
   limit also runs before `/graphql`. A mounted route reads `c.var.caller`
   like the application's own.
3. The kernel gives every plugin's `api`, `start` and `stop` the application's
   `models`: each model's schema as the adapter receives it (D-73), its
   unique targets, the fields with a read rule (`private` when only Master reads them, D-44), the fields `create` needs (amended 2026-10-23), its `.with` key for that plugin, and its queries. A
   transport reads nothing else of the kernel.
4. The schema follows D-41 and D-20, at `/graphql` (`path` option), over GET
   for queries and POST: `post(where: PostWhereUniqueInput!): Post`, `null`
   when absent; `posts(where, orderBy, ...)`; `createPost(data)`,
   `updatePost(where, data)`, `deletePost(where)`. Inputs spell the query
   API: `StringFilter { equals, not, in, notIn, lt, lte, gt, gte, contains,
startsWith, endsWith }`, `is`/`isNot`, `some`/`every`/`none`,
   `AND`/`OR`/`NOT`, relation writes with `connect` and `disconnect`; no
   shorthand (`title: "x"`), which a GraphQL input cannot type.
   `PostWhereUniqueInput` is `@oneOf`. Scalars: `String`, `Float`, `Boolean`,
   `DateTime` (ISO 8601), `JSON`, an enum per `enumOf` field
   (`PostStatus`), `ID!` for `id`. As D-44 says, a field only Master reads
   is absent from the types, and one with another read rule is nullable; a
   `one` relation is always nullable, since its target's read rule may hide
   the row (D-86). Each root field runs one kernel query
   built from the whole selection, nested relations included (D-46): no
   resolver per relation, no N+1. Each root field is its own operation; two
   mutations in one document share no transaction. `PostCreateInput` and `PostUpdateInput` hold every field, those only Master reads included. In `PostCreateInput`, a field `create`'s type needs, neither optional nor with a default (D-53), is non-null, so a client's generated types require it and a document missing it is refused before it runs; the others are optional. A field a hook fills takes a default instead, as D-53 says (amended 2026-10-23). Relation writes share their
   inputs across models, since `connect` names a row by its `id` alone:
   `ConnectInput { id }`, `CreateOneRelationInput { connect }`,
   `UpdateOneRelationInput @oneOf { connect, disconnect: Boolean }`,
   `CreateManyRelationInput { connect }` and
   `UpdateManyRelationInput { connect, disconnect }`. `createPost` and
   `updatePost` return `Post!`, the written row even when a read rule would
   hide it (D-86). `deletePost` returns `DeletedPost!`, the row as it was
   without its relations (D-102): `id`, the dates and the scalar fields.
5. Lists are Relay connections, at the root and on every `many` relation,
   with `first`/`after` and `last`/`before` and an opaque cursor (the
   row's `id`, base64url); the kernel's order always ends with `id`, so a
   cursor stays exact. `totalCount` exists on root connections only and
   costs a `count` only when selected. `pagination: 'list'` gives
   `posts(take, skip): [Post!]!` instead.
6. Limits (D-55), for callers other than Master: a list without `first`,
   `last` or `take` gets `take` rows (100), and asks for at most `maxTake`
   (100), set as `graphqlPlugin({ take, maxTake })` and per model as
   `.with({ graphql: { maxTake } })`; at every depth. A document nested
   deeper than `maxDepth` (10) is refused; `__schema` and `__type` do not
   count, since the standard introspection query is about 12 levels deep;
   they keep graphql-js's own limit, three nested lists, measured once per
   fragment rather than once per path, which a 1.5 KB document made take 2.4
   seconds (amended 2026-10-23).
   A document that may return more than `maxRows` rows (20 000), set as
   `graphqlPlugin({ maxRows })`, is refused before it runs, mutations
   included. A list counts the rows it asks for, times the rows of the lists
   above it: `take` when it asks for none or a negative number, `maxTake` at
   most, and `take` at least when it selects `totalCount`, since a count
   reads the rows it counts. A single row, a `one` relation and a mutation
   count one row each. Each alias counts apart; a fragment spread twice
   counts once (amended 2026-10-23) A document of more than 2,000 tokens,
   about ten times the standard introspection query, is refused before it is
   validated, Master's included: graphql-js validates a field repeated under
   one key in quadratic time, and 12,000 copies took 6 seconds (amended
   2026-10-23).
7. A model whose `use` lists `graphql()` takes `.with({ graphql: { plural } })`
   or `.with({ graphql: false })`. A hidden model is absent from the schema,
   its types included, unless an exposed model's relation reaches it. In
   production, introspection is off and errors carry no "Did you mean"
   suggestion, as D-04 closes by default; `introspection: true` reopens both.
8. Errors follow D-106: a `PublicError` gives `extensions: { code, details }`;
   any other error gives `Internal error.` with `extensions: { code:
'INTERNAL', correlationId }`, logged with the same `correlationId`. HTTP
   statuses are `graphql-http`'s. An error graphql-js gives for a value it
   refuses names the reason, never the value, which may be a password: its
   `found: …` part is dropped (amended 2026-10-25).
9. Outside production, `GET /graphql` from a browser serves GraphiQL 5,
   loaded from esm.sh at pinned versions. `extend: (schema) => schema`
   replaces the generated `GraphQLSchema` with one built from it (D-45).
   Every resolver, generated or added, receives the exported
   `GraphqlContext`: `{ caller, select }`. `context.select(info)` is the
   kernel's `select` for what the client asks of the rows a field returns, a
   model or a list of one, relations and their pages included, limited as
   the caller (D-55); a field returning anything else throws. A relation
   absent from a row its rule cannot hide throws "Post.author was not read;
   select it with context.select(info)." A field added to a model's type, as
   `extend type Post { shout: String }`, receives the row with its `id`, its
   dates and every scalar field the caller reads, since its needs are unknown
   (amended 2026-10-23). The row budget does not know what an
   added field returns, so it counts it as no rows (amended 2026-10-23).

   ```ts
   // Before: the context typed by hand, `author` never read
   resolve: (_, __, context: { caller: Caller }) =>
   	Post.findMany({}, { as: context.caller })
   // After: what the client asks is read, and a field may be added
   resolve: (_, __, context: GraphqlContext, info) =>
   	Post.findMany(
   		{ select: { ...context.select(info), status: true } },
   		{ as: context.caller },
   	)
   ```

10. Functions over GraphQL, as a query or a mutation, follow D-109
    (amended 2026-10-23). Out of 0.1: subscriptions, the Relay `Node` interface
    and `node(id)`, batched requests, a cost per field, persisted queries, a
    nested `totalCount`, hiding one field, and one relation selected twice
    with different arguments, which is refused (amended 2026-10-23).

Why: one plugin turns the models into the GraphQL that Relay and Apollo
expect, through the same caller and rules as server code. Mounting from `api`
uses the order the kernel already has, so the HTTP plugin keeps one router.
Translating the selection into one query is what keeps GraphQL as fast as
the query API (D-46). The previous base leaked hidden models through their
types and suggestions (its ADR-0333) and checked the integrity of every
GraphiQL module with a generator of its own; a development screen does not
need the latter.
Rejected: `Node` with global ids (`Post:uuid`), which brings back Parse's
`id`/`objectId` split, or with raw ids, which needs one query per model to
find a type; `graphql-depth-limit`, unmaintained; `ruru`, a large package for
one development screen; introspection open in production by default.
Example:

```js
// Before: Parse Server
const parse = new ParseServer({ databaseURI, appId, masterKey })
const gql = new ParseGraphQLServer(parse, {
	graphQLPath: '/graphql',
	playgroundPath: '/playground',
})
app.use('/parse', parse.app)
gql.applyGraphQL(app)
gql.applyPlayground(app)
```

```ts
// After
export default defineApp({
	database: postgres({ url: process.env.DATABASE_URL }),
	plugins: [httpPlugin({ cors: ['https://app.example.com'] }), graphqlPlugin()],
	models: [Post, User],
})
```

```graphql
query {
	posts(first: 20, where: { status: { equals: published } }) {
		edges {
			cursor
			node {
				title
				author {
					name
				}
				comments(first: 3) {
					edges {
						node {
							body
						}
					}
				}
			}
		}
		pageInfo {
			hasNextPage
			endCursor
		}
		totalCount
	}
}
mutation {
	createPost(
		data: { title: "Hi", status: draft, author: { connect: { id: "…" } } }
	) {
		id
	}
}
```

## D-108: Request bodies, Hono's errors and the development log

Choice: completes D-106 and D-107.

1. `@ultimabase/http` exports `validate(target, schema)`, a Hono middleware
   built on `hono/validator`: `target` is `'json'`, `'query'`, `'param'`,
   `'header'`, `'form'` or `'cookie'`, and `schema` any Standard Schema (Zod,
   Valibot, ArkType). A route reads the parsed value, typed, as
   `c.req.valid('json')`. A value the schema refuses is `VALIDATION_FAILED`
   (400) with `details.issues`, each `{ path, message }`, as the kernel sends
   them (D-23, D-72); the path starts inside the value, without the target.
   `validate('json')` refuses a body whose content type is not JSON with
   `UNSUPPORTED_MEDIA_TYPE` (415): Hono would validate it as `{}`, and a
   `text/plain` body is one a page on another origin sends without a
   preflight (amended 2026-10-23).
2. A body `c.req.json()` cannot parse is `BAD_REQUEST` (400), with Hono's
   message `Malformed JSON in request body`, whether a route or `validate`
   reads it. It is the client's error and is not logged. So is a form
   `c.req.formData()` or `c.req.parseBody()` cannot parse, `Malformed form
data in request body` (amended 2026-10-23).
3. A Hono `HTTPException` keeps its status. One built with a response sends
   that response; any other is sent as `{ code, message }`, `code` the
   status's name in capitals (`401` is `UNAUTHORIZED`, a status Node does not
   name is `HTTP_306`), `message` its own or the status's name. It is not
   logged: the route chose it.
4. `routes()` holds the anonymous caller when no application read one, so
   `routes().request(…)` tests a route as an anonymous request; a test that
   needs another caller starts the application (D-106).
5. Outside production, each request is logged once it is answered, at
   `info`: `POST /notes 201 12ms`. In production nothing is logged per
   request. A control character in a path stays encoded (`%0A`), so a path
   cannot forge a line; a client that leaves before its body ends is `499`,
   as nginx counts it, and not logged as an error (amended 2026-10-23).
6. The HTTP plugin's API gains `url()`, the address the server listens on
   once it started (`http://localhost:3000`); before, it throws. Outside
   production, `graphqlPlugin` logs `GraphiQL on http://localhost:3000/graphql.`
   when it starts.
7. A middleware an application's `routes()` registers with `use` runs for
   every route after it in the application, those other plugins mount
   included (D-107), since Hono mounts routes in their order: a middleware
   for some routes only gives a path, `use('/admin/*', …)`.
8. An error inside a stream (`stream`, `streamSSE`) comes after its status
   was sent: the log shows `200`, and Hono writes the error with
   `console.error` unless the route passes the helper's third argument,
   `streamSSE(c, write, (error, stream) => …)` (amended 2026-10-23).
9. The HTTP plugin reads each `routes()` when the server starts: a route
   added to one after `start` is not served (amended 2026-10-23).

Why: a route that reads a body should check it in one line and send the same
errors the kernel sends; Hono's own ways to refuse a request must not turn
into a 500 the server logs as its fault. `hono/validator` already ships with
Hono, so a Standard Schema needs no package of its own. A readable line per
request is what a developer looks at while building (D-93).
Rejected: `@hono/standard-validator`, a package whose failures still need our
error shape; `BAD_REQUEST` for every `SyntaxError`, which would also hide the
server's own `JSON.parse` bugs; a request log in production, which belongs to
the platform's access logs; an option to turn the development log off, until
someone asks.
Example:

```ts
// Before (D-106): the body's type is asserted, not checked
webhooks.post('/webhooks/stripe', async (c) => {
	const { id } = await c.req.json<{ id: string }>()
	// …
})

// After
import { routes, validate } from '@ultimabase/http'
import { z } from 'zod'

webhooks.post(
	'/webhooks/stripe',
	validate('json', z.object({ id: z.string() })),
	async (c) => {
		const { id } = c.req.valid('json')
		// …
	},
)
```

```bash
npx ultimabase dev
# Listening on http://localhost:3000.
# GraphiQL on http://localhost:3000/graphql.
# POST /webhooks/stripe 400 3ms
curl -X POST localhost:3000/webhooks/stripe -H 'content-type: application/json' -d '{"id":1}'
# 400 { "code": "VALIDATION_FAILED", "message": "Invalid data.",
#       "details": { "issues": [{ "path": ["id"], "message": "Invalid input: expected string, received number" }] } }
curl -X POST localhost:3000/webhooks/stripe -H 'content-type: application/json' -d '{oops'
# 400 { "code": "BAD_REQUEST", "message": "Malformed JSON in request body" }
```

## D-109: `defineFunction` and `defineType`, at run time and over GraphQL

Amended by D-113.

Choice: completes D-27, D-45, D-75 and D-107, and amends D-45's outputs.

1. Query or mutation. A function is a mutation unless its definition says
   `query: true`. The flag belongs to the function, not to `.with({ graphql })`:
   GraphQL puts a query under `Query`, served over GET and POST, and a
   mutation under `Mutation`, POST only; REST will choose GET or POST from
   it.
2. Arguments. An object input gives one GraphQL argument per top-level
   property, `postBySlug(slug: String!)`, non-null when the property is
   required and has no default; any other input is one `input` argument; no
   input, no argument. A client that wants one named argument writes
   `z.object({ input: z.object({ … }).meta({ id: 'CreateOrderInput' }) })`.
   The transport hands the arguments to the validator as the client sent
   them: a `null` given to an optional property is refused unless the schema
   accepts `null`. An input is always one Standard Schema, so its refinements
   and transforms apply to the whole object; it names its types through the
   validator (`.meta({ id })`), and the kernel adds no `defineInput`.
3. Outputs. A Standard Schema describes data; the kernel's forms exist only
   where a model is:

   | Output                            | Form                                             |
   | --------------------------------- | ------------------------------------------------ |
   | Nothing                           | no `output`: `run` returns `void`                |
   | Data: a scalar, an object, a list | a Standard Schema, named by `.meta({ id })`      |
   | A model                           | `Post`, `[Post]`, `Post.nullable()`              |
   | An object holding a model         | a `defineType`: `Hit`, `[Hit]`, `Hit.nullable()` |

   `defineType({ name, fields })` declares a named object; each field is an
   output of this table, a type included, except nothing. It has no `use`
   and no `.with`: a transport exposes it where a function returns it. Its
   name shares the models' names: a type named like a model stops startup.
   `X.nullable()` is a model or a type, or `null`: `run` returns
   `PostRecord | null` and the GraphQL field is nullable, as
   `post(where): Post` is (D-107). A list holds a model or a type, not
   `null`; a list of data is a schema (`z.array`). The anonymous object of
   D-45, `{ todo: Todo, created: z.boolean() }`, is gone: an object holding a
   model is named by its author.

4. Without an output, the GraphQL field is `Boolean!`, which is `true` once
   `run` resolved, since GraphQL has no empty type. A model, a type and a
   list are non-null; a schema is nullable when its JSON Schema accepts
   `null` or, inside an object, when the property is optional. An optional
   output schema exports as the same schema without `undefined`, so a `run`
   that returns `undefined` there fails the call, its log naming `.nullable()`
   (amended 2026-10-23).
5. Relations. `run` returns rows without their relations. When the client
   selects a relation under a model the function returns, the transport
   reads the returned rows again by `id`, as the caller, with the selection
   of each relation: one query per model, only when a relation is selected
   (D-46). A returned row the caller cannot read has no relations: `null`
   for a `one`, an empty list for a `many`. Its scalars are those `run`
   returned, since a function is trusted server code (D-27).
6. GraphQL types of a schema, from its JSON Schema (draft 2020-12, D-45):
   `string` is `String`, and `DateTime` with `format: 'date-time'`
   (`z.iso.datetime()`), as the models' dates are; the validator receives
   the ISO string the client sent, and an output `DateTime` takes a `Date`
   or an ISO string. `integer` is `Int`, whatever its bounds (Zod gives every
   integer the 53-bit safe bounds), so a value beyond 32 bits is refused by
   GraphQL; `number` is `Float`; `boolean` is `Boolean`; a string `enum`
   whose values are all GraphQL names is an enum named from its path; an
   `enum` or `const` of `integer`, `number` or `boolean` takes that type's
   scalar, as `z.literal(1)` is `Int` (amended 2026-10-23); any other `enum`
   or `const` is a `String`; an `array` is a list; an `object` with
   `properties` is a type named from its path; an object without them, as
   `z.record`, and a schema without a `type`, as `z.unknown()`, are `JSON`. A
   `$ref` to a schema given an id (`.meta({ id: 'Address' })`) is the shared
   output type `Address` and input type `AddressInput`. A union other than
   one type with `null` stops startup, naming the function and the path, as
   a schema without a JSON Schema export does (`z.date()`, D-45).
7. Names. A schema's object without an id is named from the function's name
   in GraphQL and its path: `TodoStatsOutput`, `TodoStatsOutputByDay`,
   `CreateOrderInputAddress`. The field is the function's name, or
   `.with({ graphql: { name } })`; `false` hides it (D-27). A name a
   generated root field or another function already takes stops startup,
   naming both; so does one type name given two different shapes (D-45), a
   type named like a model or a generated type (`PageInfo`,
   `UserConnection`), and a recursive schema without an id, which GraphQL
   can only type by its name (amended 2026-10-23).
8. Limits (D-107). A function counts one row for a model, and `take` rows
   for a list, times the lists above it. A list may hold any number of rows
   while the client selects none of their relations; one that holds more
   than `take` rows under a selected relation fails the call, its log naming
   the function and `take`, since its re-read would pass `maxRows`
   (amended 2026-10-23). `maxDepth`, the token limit and `maxRows` apply as
   to any field.
9. The kernel gives every plugin's `api`, `start` and `stop` the
   application's `functions`, as it gives `models` (D-107): each function's
   name, `query`, its input and output, its `.with` key for that plugin, and
   `run(input, { as })` (D-75), those of plugins included (D-113, amended
   2026-10-24). The kernel checks the access rule, closed to
   all but Master by default (D-04), before it validates the input, then
   runs the function, as `run` from server code does.

Why: a function that writes must never be a GET by accident, since a page
on another origin can send one; Parse sends every Cloud Function as a POST.
Flat arguments read like the generated root fields. A model cannot go inside
a `z.object`, which refuses any schema not built by Zod, so an object that
holds one is the kernel's; naming it makes it one GraphQL type its author
chose, reusable across functions and in fragments, and nullable like a
model. Keeping each need to one form avoids two spellings of the same type.
The null of `.nullable()` says "absent" without an error, as the generated
fields do. Dates read as the models' do, so a client's generated types agree.
A mutation without a result is common (`sendInvite`); `return true` was
ceremony. Reading relations again keeps `run` typed and the same for every
transport: a `select` handed to `run` would type its rows `{ id }` only, and
a function that forgot it would fail only when a client asked for a
relation.
Rejected: `query` in `.with({ graphql })`; one Relay `input` argument;
`defineInput`, which would only name a schema the validator already names;
outputs always through `defineType`, which would wrap `archivePost`'s row
as `archivePost { post { … } }`; the anonymous mixed object; throwing
`NOT_FOUND` for an absent row; describing outputs with the models' field
builders, which would need new ones (`int`, `list`, `object`) and rebuild
Nexus (D-45); handing `run` the client's `select`; reading again only the
relations `run` did not include, which must compare their page arguments,
until a measurement asks for it.
Example:

```ts
// Before (D-45): absence is an error, an object holding a model is
// anonymous, and a mutation without a result returns `true` by hand
export const postBySlug = defineFunction({
	name: 'postBySlug',
	input: z.object({ slug: z.string() }),
	output: Post,
	run: async ({ input, caller }) => {
		const [post] = await Post.findMany(
			{ where: { slug: { equals: input.slug } }, take: 1 },
			{ as: caller },
		)
		if (!post) throw new PublicError('NOT_FOUND', 'No such post.')
		return post
	},
})
export const ensureTodo = defineFunction({
	name: 'ensureTodo',
	input: z.object({ title: z.string() }),
	output: { todo: Todo, created: z.boolean() }, // EnsureTodoOutput
	run: …,
})
export const sendInvite = defineFunction({
	name: 'sendInvite',
	input: z.object({ email: z.email() }),
	output: z.boolean(),
	run: async ({ input }) => {
		await mail(input.email)
		return true
	},
})

// After
export const postBySlug = defineFunction({
	name: 'postBySlug',
	query: true,
	input: z.object({ slug: z.string() }),
	output: Post.nullable(),
	run: async ({ input, caller }) => {
		const [post] = await Post.findMany(
			{ where: { slug: { equals: input.slug } }, take: 1 },
			{ as: caller },
		)
		return post ?? null
	},
}).with({ access: allow.public })

export const EnsuredTodo = defineType({
	name: 'EnsuredTodo',
	fields: { todo: Todo, created: z.boolean() },
})
export const ensureTodo = defineFunction({
	name: 'ensureTodo',
	input: z.object({ title: z.string() }),
	output: EnsuredTodo,
	run: …,
})

export const SearchHit = defineType({
	name: 'SearchHit',
	fields: { post: Post, score: z.number() },
})
export const searchPosts = defineFunction({
	name: 'searchPosts',
	query: true,
	input: z.object({ text: z.string(), since: z.iso.datetime().optional() }),
	output: [SearchHit],
	run: ({ input, caller }) => rank(input, caller),
})

export const sendInvite = defineFunction({
	name: 'sendInvite',
	input: z.object({ email: z.email() }),
	run: async ({ input }) => {
		await mail(input.email)
	},
})
```

```graphql
query {
	postBySlug(slug: "hello") {
		title
		author {
			name
		}
	}
	searchPosts(text: "hono", since: "2026-10-01T00:00:00Z") {
		score
		post {
			title
		}
	}
}
mutation {
	sendInvite(email: "a@example.com") # true
}
```

## D-110: A plugin's own models stay out of every other plugin

Choice: `definePlugin({ models: [AuthSession] })` gives a plugin models of its
own, each an ordinary `defineModel` value the plugin does not have to export.
The application does not list them. The kernel resolves them with the
application's models: they get tables and migrations (D-26, D-105), queries,
validation, hooks and transactions. No plugin's `context.models` holds them,
the owner's included: a transport never exposes them, and the owner queries
them through the values it imports, usually `as: master`. Without an access
rule they refuse every other caller (D-04).

1. A plugin's model relates only to models of the same plugin. It keeps an
   application row's id as a scalar (`userId: f.string()`), and the plugin's
   hooks on the models that use it delete what depends on a row, in the
   operation's transaction (D-36).
2. A plugin names its models after itself (`AuthSession`, stored as
   `auth_session`, D-63). `start` refuses a model named like another, the
   application's or a plugin's, naming its plugin.
3. A function cannot return a plugin's model (D-109).
4. A plugin that acts on every model, as ACL, acts on the application's.

Why: sessions, sign-in attempts (D-39, D-56) and password hashes are no data
an application exposes. Listing them in `models` and hiding them from each
transport (`graphql: false`) would expose them through any transport added
later, and the master key would read password hashes in GraphiQL. A
relation to the user model would need its other side there (D-37), which
reaches the hidden model from the user's GraphQL type (D-107), and auth's
code cannot name the user model before `defineUser`. The cost is no
foreign key: deleting a user removes its sessions in auth's hook.
Rejected: the models in `defineApp({ models })`, hidden per transport;
an `internal: true` flag on `defineModel`, which still needs a way to list
the model; the previous base's private storage with its own narrow API
(its ADR-0234), a second storage path and its own migrations; a relation
to the application's models with no inverse side, against D-37.
Example:

```ts
// Before: the application lists auth's models and hides them in each transport
export const app = defineApp({
	database: postgres(),
	plugins: [httpPlugin(), graphqlPlugin(), authPlugin()],
	models: [User, Post, AuthSession],
})
// and `.with({ graphql: false })` on AuthSession, then `rest: false` in phase 7

// After: in @ultimabase/auth, a model it does not export
const AuthSession = defineModel({
	name: 'AuthSession',
	fields: (f) => ({
		tokenHash: f.string({ unique: true }),
		userId: f.string(),
		expiresAt: f.date(),
	}),
	indexes: [{ fields: ['userId'] }],
})
const authDefinition = definePlugin<Auth>({
	name: 'auth',
	manifest,
	models: [AuthSession],
	hooks: {
		// What a user owns goes with it, in one write (D-111).
		afterDelete: async ({ record }) => {
			await AuthSession.deleteMany(
				{ where: { userId: record.id } },
				{ as: master },
			)
		},
	},
})
// In the application: nothing to list
export const app = defineApp({
	database: postgres(),
	plugins: [httpPlugin(), graphqlPlugin(), authPlugin()],
	models: [User, Post],
})
```

## D-111: `deleteMany` runs a delete's rules and hooks on each row

Choice: `Model.deleteMany({ where }, { as })` deletes every row `where`
selects that the caller reads, and returns `{ count }`, as in Prisma. Without
`where` it selects every such row, as Prisma's `deleteMany()`. It takes no
`take`, `orderBy` or `select`.

1. Each row goes through what a `delete` runs (D-48, D-90): the `delete`
   rule on its record, `beforeDelete`, a plugin's `redirect` (the soft-delete
   trash), the cascades, `afterDelete` and `afterDeleteCommit`.
2. It is all or nothing: one row the rule refuses fails the whole call with
   `ACCESS_DENIED`, and nothing is deleted; so does a `restrict` relation
   (D-54). A row the caller cannot read is left out, not refused (D-72), and
   no row matching is `{ count: 0 }`, not `NOT_FOUND`.
3. When no rule applies and nothing in the reach runs code, it is one write
   (D-102): its `where` is the root filter, and the count comes from the rows
   its delete removed (D-104, amended 2026-10-25). Otherwise the rows are loaded locked in the
   write's transaction, as a delete's reach is (D-90): BEGIN, one read, one
   write, COMMIT when nothing else runs.
4. It is server code: neither `graphqlPlugin()` nor `httpPlugin()` exposes
   it, since a client's delete of many rows is an application's function
   (D-109).

Why: a plugin removes what depends on a row in its hook, as auth's sessions
of a deleted user (D-110), and a loop of `findMany` and `delete` costs one
query per row and loses the one-write case. The kernel already deletes many
rows per call through cascades, with the hooks and the trash per row, so
`deleteMany` adds an entry point, not a pipeline.
Limit: the one-write case counts the rows its delete removed (D-104).
Rejected: a batch hook that receives every row at once, which a plugin
written for `delete` would miss; skipping rules and hooks in bulk, against
D-48; deleting the rows the rule allows and leaving the others, which hides a
refusal; returning the rows, which Prisma does not.
Later: `updateMany`, `createMany` and `upsert` stay as D-20 defers them.
Example:

```ts
// Before: one query to list the sessions, then one per session
afterDelete: async ({ record }) => {
	const where = { userId: record.id }
	for (const { id } of await AuthSession.findMany({ where }, { as: master })) {
		await AuthSession.delete({ where: { id } }, { as: master })
	}
},

// After: one write, since AuthSession has no hook or rule of its own
afterDelete: async ({ record }) => {
	await AuthSession.deleteMany({ where: { userId: record.id } }, { as: master })
},

// A user empties their read notifications: the delete rule runs on each row
const { count } = await Notification.deleteMany(
	{ where: { read: true } },
	{ as: caller },
)
```

## D-112: auth's sessions, Identify and the API of sign-in methods

Amended by D-113 and D-115.

Choice: completes D-33, D-39, D-62, D-79 and D-106.

1. `@ultimabase/auth` exports `authPlugin()`, `defineUser` (D-62),
   `isAuthenticated` (D-10), `isSelf`, `signedIn`, `isOwner` and
   `currentUser` (D-79). auth requires `httpPlugin()` (D-16).
2. The kernel gives `definePlugin` an `identify(request, context)` that
   returns a `Caller`, or `undefined` when the request is not its own.
   The master key is checked first (D-49); then each plugin's `identify`
   runs in the order of `plugins`, and the first caller wins; otherwise the
   request is anonymous.
3. A session is a row of auth's own model `AuthSession` (D-110):
   `tokenHash`, `userId` and `expiresAt`. Its token is 32 random bytes in
   base64url, shown once; the database keeps only its SHA-256 digest. A
   session ends 30 days after its last use: one used with fewer than 15 days
   left gets 30 days again, one write at most per 15 days. An expired session
   met by Identify is deleted, and each sign-in deletes the user's expired
   sessions. Deleting the user deletes their sessions (D-111).
4. Identify reads `Authorization: Bearer <token>`, then the cookie; the
   header wins when both are sent. An unknown or expired token in the
   header fails the request with `UNAUTHENTICATED`, a kernel code sent with
   status 401, so a client knows to sign in again. One in the cookie is
   anonymous, since a browser's script cannot remove an httpOnly cookie and a
   stale one must not lock it out of the sign-in route. A known token makes
   `caller.user` the user's row, read as Master (D-62).
5. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and lives 400 days,
   the browsers' longest; the session's own expiry decides, so the cookie
   is not sent again when a session gets more days. In production it is
   `Secure` and named `__Host-ultimabase_session`, which a subdomain cannot
   overwrite; outside, `ultimabase_session`, so it works on
   `http://localhost`. `httpPlugin()`'s CORS allows credentials for the
   origins it allows, so a front end on another origin sends the cookie.
6. auth's API, for the sign-in methods (D-33): `signIn(userId, client?)`
   opens a session, sets its cookie through the function's `client` when
   there is one, and returns `{ token, expiresAt }`; `revokeSessions(userId)`
   ends every session of a user. auth's function `signOut` ends the
   request's session and clears the cookie; auth mounts no route (D-113,
   amended 2026-10-24).

Why: an opaque token stored hashed is revocable (D-39) and useless when the
database leaks; SHA-256 fits a random token, as Argon2id fits a password
(D-56). Identify is the kernel's because every transport reads the same
caller (D-106), and a plugin's `identify` serves a later API-key plugin too.
A session that renews itself while used is what a user expects of a
"remember me". The previous base refused a stale cookie and needed an
exception for its sign-in routes (its ADR-0236).
Limit: Identify takes two round trips, the session then the user, since
`AuthSession` relates to no model of the application (D-110). The
lifetime is fixed until an application asks for an option.
Rejected: JWTs (D-39); the token stored in clear; one lifetime from sign-in
on, which signs out an active user every month; refusing a stale cookie; a
cookie sent again on each renewal, which Identify cannot do without the
response.
Example:

```ts
// Before: Parse
const user = await Parse.User.logIn(email, password) // user.getSessionToken()
Parse.Cloud.define('publish', ({ user }) => {
	if (!user) throw new Parse.Error(209, 'Invalid session token')
})

// After: the application
export const User = defineUser({
	name: 'User',
	fields: (f) => ({ role: f.enumOf(['reader', 'editor']) }),
})
export default defineApp({
	database: postgres({ url: process.env.DATABASE_URL }),
	plugins: [httpPlugin(), authPlugin(), passwordPlugin()],
	models: [User, Post],
})
// Any rule, hook or function reads `caller.user.role`, with no query.

// A sign-in method's function (amended 2026-10-24 by D-113)
run: async ({ input, client }) => {
	const user = await checkPassword(input)
	const { token, expiresAt } = await plugins.auth.signIn(user.id, client)
	return { token, expiresAt, user }
}
```

```bash
curl localhost:3000/graphql -H 'authorization: Bearer expired…' -d '…'
# 401 { "code": "UNAUTHENTICATED", "message": "The session expired or was revoked: sign in again." }
```

## D-113: `passwordPlugin()`, linked accounts, plugin functions and `viewer`

Amended by D-115.

Choice: completes D-33, D-56, D-109 and D-112, and amends D-56, D-109 and
D-112.

1. Plugin functions. `definePlugin({ functions })` gives a plugin
   `defineFunction` values of its own, exposed by every transport as the
   application's are (D-109): a name another function or a root field takes
   stops startup, naming both. A plugin's function may return the
   application's models, never its own (D-110). A plugin lists them as
   `functions: (context) => [...]`, called once at start with its context,
   so a function can take its options and the application's models; GraphQL
   names one `auth.signOut` in an error.
2. The client. `run` receives `client` when a transport calls the function,
   `undefined` when server code does (D-75): `client.address`, the
   connection's address (`''` when unknown, as `c.var.address` in a route),
   and `client.cookies.set(name, value, options)` and
   `client.cookies.clear(name, options)`, which the transport applies to its
   HTTP response; clearing a `Secure` or `Path` cookie needs its options.
   auth's API becomes `signIn(userId, client?)`, which sets the session's
   cookie only with a client, and `revokeSessions(userId)`.
3. Linked accounts. auth owns `AuthAccount { userId, method, subject }`,
   unique on `(method, subject)`: one row per way a user signs in, the email
   for a password, the provider's user id for OAuth (D-33). Deleting the user
   deletes them. auth's API adds `linkAccount(userId, method, subject)` and
   `accountOf(method, subject)`. A method keeps its secrets in its own models,
   never in `AuthAccount` nor on the user.
4. auth's functions. `signOut: Boolean!` ends the request's session and
   clears the cookie; it replaces D-112's `POST /auth/sign-out`, so auth mounts
   no route. `viewer: User`, a query, is the caller's user read again as the
   caller, so the user model's field rules apply; `null` when anonymous or
   when the user's read rule refuses its own row. auth adds the command
   `User.revokeSessions({ id }, options)`, which runs as Master or as that
   user and refuses any other caller with `ACCESS_DENIED`. So that a plugin's
   command tells the kernel's Master from a forged one, the kernel exports
   `isMaster(caller)`; it also exports the type `FunctionShape`, which a
   plugin's `functions` returns (amended 2026-10-24).
5. `@ultimabase/password` exports `passwordPlugin(options)` and `password()`.
   It requires auth. The user model declares `use: [password()]`, which types
   its commands and deletes the user's hash with the user; `passwordPlugin()`
   without it stops startup, naming the line to add. The email is trimmed and
   lowercased, and is the account's `subject`: the user model needs no
   `email` field, and one it declares is its own.
6. Functions, each taking one named input (D-109):
   `signUp(input: SignUpInput!): SignedIn!`,
   `signIn(input: SignInInput!): SignedIn!` and
   `changePassword(input: ChangePasswordInput!): SignedIn!`, where
   `SignedIn` is `{ token, expiresAt, user: User }`, its user read again as
   itself. `SignUpInput` holds `email`, `password` and the user fields
   `passwordPlugin({ signUp: [...] })` lists, typed from the user model; any
   other field fails with `VALIDATION_FAILED`. `signUp` creates the user, its
   account and its hash in one transaction, with the user model's validation
   and hooks. `signUp: false` removes the function. `changePassword` needs a
   signed-in caller and the current password, ends every session of the user
   and opens one for this client.
7. Commands, on the user model: `User.signUp({ email, password, data })`,
   `User.signIn({ email, password })`, which returns `SignedIn` without a
   cookie, and `User.setPassword({ id, password })`, which ends the user's
   sessions. As Master `User.signUp` skips `signUp: false` and the field
   list; as another caller it applies them, as the function does (amended
   2026-10-24).
8. Hash. Argon2id from `node:crypto`, `m=19456, t=2, p=1`, a 16-byte salt,
   stored as a PHC string (`$argon2id$v=19$m=19456,t=2,p=1$…`) in the plugin's
   `PasswordHash { userId (unique), hash }`; a sign-in rehashes a hash whose
   parameters differ. `crypto.argon2` came in Node 24.7.0, so every package's
   `engines` becomes `>=24.7.0`. A password has 8 to 256 characters, with no
   composition rule (NIST SP 800-63B).
9. Errors. An unknown email and a wrong password both fail with
   `INVALID_CREDENTIALS` (401), and the unknown email is checked against a
   dummy hash, so the time taken does not tell an account exists. An email
   already taken fails with `UNIQUE_VIOLATION` (409).
10. Attempts. Ten failures for one `(subject, address)` within 15 minutes
    fail the next attempts with `TOO_MANY_ATTEMPTS`, a kernel code sent with
    status 429 and `details.retryAfter`, in seconds (D-72; in the error's
    extensions over GraphQL, and `Retry-After` over REST). A success clears the count. The failures are
    rows of the plugin's `PasswordAttempt`. Server code without a client is
    not counted.
11. Details (amended 2026-10-24). `INVALID_CREDENTIALS` is a kernel code,
    sent with status 401. `signUp` takes neither `id`, `createdAt`,
    `updatedAt`, `email` nor `password` as a listed field, nor a relation or
    JSON field; a required user field missing from the list stops startup,
    `signUp` omitted listing none. Over GraphQL an unlisted field fails the
    input type, before `VALIDATION_FAILED`. `signUp` is not limited. Commands
    have no client, so `User.signIn` is never counted, whoever the caller;
    `User.setPassword` runs as Master or as that user, refuses any other
    caller with `ACCESS_DENIED` and fails with `NOT_FOUND` for a user without
    a password. `changePassword` counts its failures for `(user id, address)`.
    `SignedIn.user` is nullable, as `viewer`. `User.setPassword` takes no
    current password: server code checks the user's intent first.
    Each hash has a stamp, new each time the password is set: a sign-in
    reads it again once its session is open and, when it changed, ends the
    user's sessions and fails with `INVALID_CREDENTIALS`; a rehash writes
    only to the stamp it read. A password over 256 characters is refused
    without being hashed. A stored hash over 256 MiB, 16 passes or 16 lanes,
    or with a tag outside 16 to 64 bytes, fails as one that is not Argon2id.
12. Out of this decision, until a second sign-in method or an email plugin:
    unlinking an account, keeping a user's last method, linking by verified
    email, password reset and email verification.

Why: each method stays an ordinary plugin with its own functions, models,
hooks and options, so a community method is written as any plugin; the
accounts table is what lets a password and Google reach one user, and the
rule for linking is the same for every method, so it is auth's. Functions
rather than HTTP routes give an application that serves only GraphQL no
route it did not ask for, and give REST the same functions in phase 7. One
named input types a client's form (`SignUpInput`), as `PostCreateInput`
does. Fields at sign-up save a second request and the sign-up that succeeds
while its profile update fails; a closed list keeps a forgotten rule from
letting a client sign up with `role: 'admin'`. Limiting per account alone
would let anyone lock a victim out with ten wrong passwords; per address
alone would let one attacker try every account. `viewer` and `SignedIn`
read the user again because `caller.user` is read as Master (D-112).
Limit: behind a proxy every client has the proxy's address, so the limit
counts per account until `httpPlugin()` reads a forwarded address it can
trust, a separate decision. An OAuth callback is a URL the provider calls,
so it will be an HTTP route.
Rejected: `authPlugin({ methods: [password()] })`, the previous base's
ADR-0326, which re-exposes each plugin capability through a second extension
point; the hash on the user row; the email copied to the user model; HTTP
routes `/auth/sign-up` and `/auth/sign-in`; flat arguments; sign-up fields
checked by the user model's field rules as the anonymous caller, open by
default; `plugins.password.createAccount`, less discoverable than a command;
limiting per account alone.
Example:

```ts
// Before: Parse
const user = new Parse.User()
user.set({ username: email, password, pseudonym })
await user.signUp()
const signed = await Parse.User.logIn(email, password) // signed.getSessionToken()
const me = Parse.User.current()

// After: the application
export const User = defineUser({
	name: 'User',
	use: [password()],
	fields: (f) => ({
		pseudonym: f.string(),
		birthDate: f.date({ optional: true }),
		role: f.enumOf(['reader', 'editor'], { default: 'reader' }),
	}),
})
export default defineApp({
	database: postgres({ url: process.env.DATABASE_URL }),
	plugins: [
		httpPlugin(),
		graphqlPlugin(),
		authPlugin(),
		passwordPlugin({ signUp: ['pseudonym', 'birthDate'] }),
	],
	models: [User, Post],
})

// Server code: a seed, an invitation, a back office
const ada = await User.signUp(
	{ email: 'ada@example.com', password, data: { pseudonym: 'ada' } },
	{ as: master },
)
await User.setPassword({ id: ada.id, password: next }, { as: master })
```

```graphql
mutation SignUp($input: SignUpInput!) {
	signUp(input: $input) {
		user {
			id
			pseudonym
		}
	}
}
query {
	viewer {
		pseudonym
	}
}
mutation {
	signOut
}
```

```json
{
	"errors": [
		{
			"message": "Too many attempts: try again later.",
			"extensions": {
				"code": "TOO_MANY_ATTEMPTS",
				"details": { "retryAfter": 900 }
			}
		}
	]
}
```

## D-114: `passwordPlugin()`'s limits against many addresses

Amended by D-115.

Choice: completes D-113.

1. An IPv6 address counts as its /64 network, an IPv4-mapped IPv6 address
   as its IPv4 address; the sign-in limit and the sign-up limit count these.
2. Each subject, whatever the address, has a ceiling: the 101st failed
   attempt within 15 minutes is refused with `TOO_MANY_ATTEMPTS`, for every
   address, until the oldest of the hundred is 15 minutes old. A success
   clears its own address's failures only. Each address, whatever the
   subject, has the same ceiling: the 101st failed attempt from it within
   15 minutes is refused on every subject (amended 2026-10-24).
3. At most `os.availableParallelism()` Argon2 computations run at once in a
   process, and 64 more wait; one more fails with `TOO_MANY_ATTEMPTS` and
   `retryAfter: 1`, and an attempt that fails so is not counted.
4. The `signUp` function is limited per address: the 11th within one hour,
   successful or not, is refused with `TOO_MANY_ATTEMPTS`. The `User.signUp`
   command is not.
5. These values are fixed: no option.

Why: an IPv6 client holds a /64 at least, so counting each address gives
one attacker as many limits as it wants. The per-pair limit alone lets an
attacker with a thousand addresses try ten thousand passwords on an account
every 15 minutes; the ceiling caps that at a hundred, at the cost of a
victim that many addresses can lock out for 15 minutes. Without the
address's ceiling, one address tries a common password on every account it
knows, one failure each, and is never refused; with it, a hundred accounts
every 15 minutes, at the cost of the clients behind one shared address, such
as a mobile carrier's NAT, that one attacker among them can lock out. Argon2 holds 19 MiB
and a thread for each computation, so a burst of sign-ins would exhaust the
memory and the threadpool; a busy server refuses at once rather than queue
without end. A sign-up hashes a password and creates rows, so it is limited
as a sign-in is.
Rejected: options for the values, until an application needs another one; a
delay growing with the failures, which still holds a connection for each;
counting IPv6 by /48 or /56, which groups unrelated clients of one provider.
Example:

```ts
// A client's sign-in, unchanged; what it gets after many failures changes.
const response = await fetch('/graphql', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		query: signIn,
		variables: { input: { email, password } },
	}),
})
// Before (D-113): from 2001:db8::2 after ten failures from 2001:db8::1, a
// fresh limit of ten. After: refused, one /64 network is one address
// { "errors": [{ "extensions": { "code": "TOO_MANY_ATTEMPTS", "details": { "retryAfter": 840 } } }] }
```

The application's code does not change.

## D-115: auth and password after their audit

Amended by D-116.

Choice: amends D-112, D-113 and D-114.

1. A function's `client` reads the request's cookies:
   `client.cookies.get(name)`, `undefined` when the request has none. When
   auth's `signIn(userId, client)` sets the session's cookie, it first ends
   the session the request's cookie held, whoever's it was.
2. Outside production the cookie is neither `Secure` nor `__Host-`
   (D-112). auth logs one warning per running application the first time
   it identifies a request for a host that is not local (`localhost`,
   `*.localhost`, `127.0.0.1` or `[::1]`, the kernel's `isLocalHost`, amended
   2026-10-24), naming `NODE_ENV=production`.
3. `User.signIn({ email, password }, { client })` counts the attempt and
   sets the cookie as the `signIn` function does; without `client` it is
   still not counted (D-113 point 11).
4. Each sign-in deletes every expired session, not only the user's;
   `AuthSession` gets an index on `expiresAt`.
5. A password is normalized to NFKC before it is measured, hashed or
   checked; an email is lowercased then normalized to NFC.
6. A session also ends one year after its sign-in, however often it is
   used: a renewal never sets `expiresAt` past it.
7. Known and kept, written in the plugins' documentation: the token is in
   `SignedIn` even when the cookie is set, since a mobile client needs it
   and a function cannot tell one client from another; `signUp`'s
   `UNIQUE_VIOLATION` tells an email has an account, which only email
   verification can hide; a hundred failures from many addresses lock an
   account for 15 minutes, and a hundred from one address lock that address
   out of every account (D-114).
8. A test pins that a mutation over GET, and a POST that is not JSON, fail
   without running, so a page on another site cannot use the cookie.

Why: a browser that signs in again overwrites its cookie, and the session it
held stayed valid for 30 days with nobody able to end it; a Bearer client
keeps its old token and may still sign out with it. An application served
over HTTPS without `NODE_ENV=production` sends its session cookie over plain
HTTP too, silently. A command without limits, called from an application's
own sign-in route, is an unlimited password oracle. Expired sessions of users
who never sign in again stayed forever. One password typed as composed or
decomposed characters gave two hashes (NIST SP 800-63B asks for NFKC). A
stolen token used every fortnight lived forever.
Rejected: closing the request's session through a `caller` given to
`signIn`, an API change for every sign-in method, which would also end a
Bearer client's session it may still use; deriving `Secure` from the
request, which a proxy hides until D-113's forwarded address is decided; a
scheduled cleanup, infrastructure no other need asks for; one lifetime of
30 days from sign-in, D-112's rejected choice.
Example:

```ts
// Before: an application's own sign-in route, never limited
routes().post('/login', async (c) => {
	const { email, password } = await c.req.json()
	return c.json(await User.signIn({ email, password }))
})

// After: limited, and the browser gets its cookie
routes().post('/login', async (c) => {
	const { email, password } = await c.req.json()
	const { client, sent } = clientOf(c)
	return sent(c.json(await User.signIn({ email, password }, { client })))
})
```

## D-116: The client's address behind proxies

Choice: completes D-113; replaces D-115's reason for not deriving `Secure`
from the request.

1. `httpPlugin({ proxies })` is the number of proxies in front of the
   server, 0 by default: a whole number, or startup fails.
2. With `proxies: n`, a client's address is the n-th entry of
   `X-Forwarded-For` from the right, each proxy having appended the address
   it saw. With fewer entries, or none, it is the connection's (amended
   2026-10-24).
3. When that entry is not an IP address, the address is the connection's.
4. Only `X-Forwarded-For` is read: neither `Forwarded`, nor a host's own
   header, nor the forwarded protocol or host. The cookie's `Secure` still
   follows `NODE_ENV` (D-112).
5. With `proxies` at 0, the first request that has `X-Forwarded-For` from a
   loopback or private address logs one warning per running application,
   naming the address every client then counts as.

Why: behind a proxy every client has the proxy's address, so ten wrong
passwords from anyone lock an account for everyone (D-113). A client writes
what it wants on the left of `X-Forwarded-For`; only the entries the proxies
appended can be trusted, and their number is what the application knows of
its hosting. Fewer entries than proxies means the request went around one,
so the client may have written all of them: taking the leftmost let a
client that reaches the server directly pick a new address for each
request. Trusting the header by default would let any client of a server
reached directly pick its address and escape every limit. An entry
that is not an address, from a proxy that appends a port for instance,
would give a limit per value written. The warning names a mistake that
otherwise shows only when accounts are locked; a public address does not
trigger it, so a client cannot make it advise `proxies` to a server reached
directly. `NODE_ENV=production` already sets `Secure`, so nothing needs the
forwarded protocol.
Rejected: a list of trusted networks, Express's `trust proxy`, which needs
the proxies' addresses that most hosts do not publish; `Forwarded`
(RFC 7239), which few proxies send; `CF-Connecting-IP` and other hosts'
headers, tied to one host and forged when the server is reached around it;
a function computing the address, until an application needs one; a
`TRUST_PROXY` variable or detecting the host, more ways to set one number.
Example:

```ts
// Before: behind Render, every client is 10.0.0.5
httpPlugin()

// After: X-Forwarded-For: 6.6.6.6, 203.0.113.7, where the client wrote
// 6.6.6.6 and Render appended 203.0.113.7
httpPlugin({ proxies: 1 })
// clientOf(c).client.address === '203.0.113.7'

// Cloudflare in front of Render: X-Forwarded-For: 203.0.113.7, 172.70.1.1
httpPlugin({ proxies: 2 })
// clientOf(c).client.address === '203.0.113.7'
```

Routes and plugins read `clientOf(c).client.address` and `c.var.address` as
before.

## D-117: Password reset and email verification

Choice: completes D-113 point 12 and D-115.

1. Sending. `passwordPlugin({ sendEmail })` takes the function that sends
   an email: it receives `{ kind: 'reset' | 'verify', to, token, userId }`
   and writes the text, builds the link and picks the service. Without it,
   the functions of point 2 are absent, as `signUp: false` removes `signUp`.
2. The functions, each public: `requestPasswordReset(input: { email })`,
   `resetPassword(input: { token, password })`, `verifyEmail(input:
{ token })` and `sendVerificationEmail`, which needs a signed-in user.
   Each returns `Boolean!`, `true`.
3. No enumeration. `requestPasswordReset` returns `true` whether the email
   has an account or not, before the user is read: the token and the email
   are made after the response, so its time tells nothing either. An
   unknown email sends nothing. A failed send is logged with
   `logger.error`; the client sees no difference. Stopping the application
   waits for the sends under way.
4. `resetPassword` sets the password, which ends every session (D-113), and
   opens none. It marks the email verified: the user received it.
5. Tokens. 32 random bytes in base64url; `PasswordToken` stores their
   SHA-256 hash with the user, the kind and the expiry. A token is used
   once and lasts one hour for a reset, 24 hours for a verification. A new
   token replaces the older one of its kind; setting a password deletes the
   pending reset tokens. A wrong, used or expired token fails with
   `INVALID_CREDENTIALS`, "This link is invalid or has expired.". No
   numeric codes.
6. Limits. `requestPasswordReset` and `sendVerificationEmail` each refuse
   the eleventh request from one address within one hour, counted as
   sign-ups are (D-114). An account receives three emails per hour, of
   either kind: past that, `sendVerificationEmail` fails with
   `TOO_MANY_ATTEMPTS` and `requestPasswordReset` sends nothing, still
   returning `true`. The values are fixed.
7. `password()` adds `emailVerified: boolean`, `false` by default, to the
   user model, which only Master writes: rules read `user.emailVerified`.
   `signUp` may not list it. The column exists without `sendEmail`, and
   stays `false`.
8. Signing in before verification is allowed. With `sendEmail`, the
   `signUp` function sends the verification email once the user exists;
   the `User.signUp` command sends nothing. `signUp` keeps refusing a taken
   email with `UNIQUE_VIOLATION` (D-115).
9. `sendVerificationEmail` sends to the email of the user's password
   account, which `AuthApi.subjectOf(userId, method)` reads: the reverse of
   `accountOf`, since auth keeps the accounts. For an email already
   verified, it returns `true` and sends nothing.

Why: without a reset, a forgotten password needs an administrator; without
verification, an application cannot tell whether an email reaches its
user. A function keeps texts, languages and the sending service the
application's, with no dependency, and a later email plugin can provide
it. Hashing the tokens makes a leaked database give no working link;
replacing older ones leaves one link alive per purpose. Opening no session
after a reset is OWASP's advice: it adds sensitive session code for little
gain. Without a per-account limit, many addresses could flood one inbox;
refusing past it on a reset would tell that the account exists. A field on
the user model is what a rule reads, as Parse's `emailVerified`.
Rejected: built-in email templates, which are the application's; an email
plugin now; six-digit codes, which can be guessed and need limits of their
own; signing in after a reset; the status in a password model or on
`AuthAccount`, which a rule cannot read simply; verification required
before any sign-in, which would make `signUp`'s type depend on an option;
options for the limits and the lifetimes. Out of this decision: changing an
email, and linking an OAuth account by its verified email.
Example:

```ts
// Before: a forgotten password needs an administrator's User.setPassword
passwordPlugin({ signUp: ['name'] })

// After
passwordPlugin({
	signUp: ['name'],
	sendEmail: async ({ kind, to, token }) => {
		await resend.emails.send({
			from: 'hello@app.example',
			to,
			subject: kind === 'reset' ? 'Reset your password' : 'Confirm your email',
			text: `https://app.example/${kind}?token=${token}`,
		})
	},
})

// Only confirmed emails publish
defineModel({ name: 'Post', fields: (f) => ({ text: f.string() }) }).with({
	access: { create: signedIn(({ user }) => user.emailVerified) },
})
```

```graphql
mutation {
	requestPasswordReset(input: { email: "ada@example.com" })
}
mutation {
	resetPassword(input: { token: "…", password: "new secret" })
}
mutation {
	verifyEmail(input: { token: "…" })
}
mutation {
	sendVerificationEmail
}
```

## D-118: Packages publish compiled JavaScript

Choice: completes D-60.

1. A package's `exports` and `bin` name `./src/*.ts` in the repository, which
   Node runs and Vitest and TypeScript read. Its `publishConfig` names
   `./dist/*.js` instead: `yarn pack` and `yarn npm publish` write it into
   the published manifest.
2. Its `prepack` script deletes `dist` and compiles `src` with `tsc`, from
   its `tsconfig.build.json`, which extends the root's: `.js` files and
   their declarations, without the tests. `rewriteRelativeImportExtensions`
   turns `./x.ts` into `./x.js` in the JavaScript; the declarations keep
   `./x.ts`, which a consumer resolves without any option. `dist` is never
   committed.
3. A package publishes `dist` and `src` without its tests: the declaration
   maps lead an editor's "go to definition" to the source. No JavaScript
   source maps.
4. `yarn test:packed` packs every package, installs the packs with npm in an
   empty directory, imports each one, typechecks the example's code against
   the published declarations, runs the installed `ultimabase --help`, and
   starts the example to sign a user up. CI runs it on every change, outside
   `yarn validate`: it needs the registry for the other dependencies.

Why: Node strips no types under `node_modules`, so a package that exports
`.ts` fails once installed with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
The workspace's links resolve outside `node_modules`, which hides it: only
an install from a pack shows it. Compiling at pack time keeps the repository
free of a build step, and `tsc` is already the type checker; it builds a
package in under a second.
Rejected: a build step for development, or `dist` in the repository; a
bundler, which the packages do not need; asking applications to run their
dependencies through a loader; `.d.ts` files rewritten to `.js`, since
TypeScript reads `./x.ts` in a declaration.
Example:

```sh
# Before: in an application, after `npm install ultimabase`
$ node app.ts
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is
currently unsupported for files under node_modules, for
".../node_modules/ultimabase/src/index.ts"

# After: the application starts and logs "Listening on http://localhost:3000."
$ node app.ts
```

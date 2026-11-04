# Decisions

The design of UltimaBase, decided with the maintainer before any code is
written. One entry per decision; a later entry may replace an earlier one by
naming it, and the earlier one then says so under its title:
`Amended by D-104.` Read an entry together with the ones that amend it.

Entries also cover features planned after the first release. Code written
today follows them: when a planned feature needs a shape now, build that
shape now instead of reworking it later.

Each entry uses this shape:

````md
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
````

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

Amended by D-173.

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

Amended by D-150.

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

Amended by D-123.

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

Amended by D-164.

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

Amended by D-159.

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

Amended by D-128, D-132, D-133, D-135, D-138, D-140, D-142, D-143, D-149 and
D-228.

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
`delete`, `updateMany` (D-133) and `deleteMany` (D-111), `findUniqueOrThrow`,
`findFirstOrThrow` and `createMany` (D-135), with `where` (scalar filters,
`is`/`isNot`, `some`/`every`/`none`, `AND`/`OR`/`NOT`), `select`, `include`,
`omit` (D-135), `orderBy`, `take`, `skip` and `cursor`, and relation writes by id:
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
`upsert`, once it is decided which rules and hooks it runs (create's or
update's); `distinct` (D-135) and aggregates;
case-insensitive filters (`mode: 'insensitive'`), left to a search plugin
first. Nested creation (`create` in a relation write) ships in 0.1, designed
in its own decision (D-68, amended 2026-10-25).
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

- REST, which ships in 0.1 after all (D-68, amended 2026-10-25).
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

Amended by D-131.

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

Amended by D-208.

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

Amended by D-220 and D-237.

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

Amended by D-130.

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

Amended by D-176, D-199.

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

Amended by D-109, D-125 and D-182.

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

The adapter's pool opens 10 connections at most; `postgres({ url,
connections: 20 })` sets another number, a whole one from 1, refused when
the app starts otherwise. A query waits up to 10 seconds for a connection,
and as long to open one; the wait is not an option. Before, an eleventh
query while ten transactions waited on something slow waited forever,
unheard; now it fails:

```
Every one of the 10 PostgreSQL connections stayed busy for 10s: a transaction may wait on something slow or never end.
```

A server that never answers fails `start` after the same 10 seconds, with
`Cannot reach PostgreSQL at host:5432 (no answer in 10s): …` (D-105). The
pool's other `pg` options stay its defaults (amended 2026-10-25).

Each connection the pool opens runs `set jit = off` before its first query.
The single query of D-46 nests a subquery per relation level, which the
planner prices high enough to compile: a role and five inherited levels
(D-123) took 535 ms compiled and 0.175 ms without, on a nearly empty table.
JIT pays off on long analytical scans, which an application's reads are not.
It is set by a statement rather than the `options` startup parameter, which
PgBouncer refuses by default (amended 2026-10-26).

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

Amended by D-170, D-174, D-215.

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

Amended by D-125.

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

Amended by D-228.

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

Amended by D-113 and D-218.

Choice: the `password` plugin hashes passwords with Argon2id from Node's
`node:crypto` (OWASP parameters: 19 MiB memory, 2 passes, parallelism 1) and
stores the algorithm and parameters with each hash, so they can change later
and old hashes are upgraded at the next sign-in. It limits sign-in and
password reset attempts per account and address together, stored in the
database (D-113, amended 2026-10-24).
Why: Argon2id is OWASP's first recommendation and Node's LTS ships it, so no
native dependency is compiled; a brute-force guard must not depend on an
optional plugin.
`httpPlugin()` limits each address's requests, and a hook each person's
writes (D-218).
Rejected: bcrypt (72-byte limit); scrypt (second choice once Argon2id is
built in); a native `argon2` package; sign-in protection left to a general
rate-limit plugin.

## D-57: A plugin is an interface of types and one `definePlugin`

Amended by D-89 and D-172.

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

Amended by D-156.

Choice: until 1.0, any minor version may break. The kernel and the official
plugins are released together with the same version number, and Changesets
writes the changelog.
Why: one number tells which official packages work together.
Rejected: independent versions per official package before 1.0.

## D-61: `npm create ultimabase` from the first release

Amended by D-130.

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

Amended by D-150.

Choice: `f.date()` stores an instant (`timestamptz` on PostgreSQL) and returns a
JavaScript `Date`. A calendar date without time (a birthday) comes later with
the types of D-09.
Why: an instant is unambiguous across time zones.
Rejected: timestamps without time zone.

## D-66: `httpPlugin()` is closed by default

Amended by D-179.

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
- REST (D-25), roles and ACL (D-13), and nested creation, `create` in a
  relation write (D-20), each designed in its own decisions before its code
  (amended 2026-10-25).

The after-commit email plugin that D-15 asks for is an example in
`examples/`, not a package. Everything else waits: the rest of D-25 (files,
OAuth, realtime…), the later field types (D-09, D-65), other
databases (D-51) and the `Later:` lines of D-20, D-44, D-55, D-56 and D-58.
Why: the smallest set that builds a real application end to end, from a
starter to production, and proves the plugin design. Most developers who
would adopt UltimaBase call a REST API and manage permissions by role, as
in Parse.
Rejected: migrations after 0.1 (nothing could go to production).

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

Amended by D-124.

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

Amended by D-179 and D-206.

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
test titles cite `D-NN`; the lint rule `ultimabase/no-decision-in-string`
refuses one in a production string (amended 2026-10-25).
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

Amended by D-105, D-136 and D-179.

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

Amended by D-214.

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

Amended by D-203.

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

Amended by D-214.

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

Amended by D-128, D-138, D-159 and D-213.

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

Amended by D-237.

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

Amended by D-224.

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
   issue `{ path: [field], message: error.message }`; a `PublicError` adds
   its `code` to the issue. A schema's issues get the field's name in front
   of their path.
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
   the developer wrote for the client, and a code is what a client tests
   without parsing that message, as for the error itself.
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
4. A cascaded row is deleted, even when its model has a `redirect` (D-89),
   and the cascade goes past it; the rows `beforeFind` hides, a soft-deleted
   row included, are deleted too. A redirected row deleted directly is
   redirected and cascades nothing (amended 2026-10-25).
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
4. A cascaded row that stayed would keep a key to the deleted row: a
   foreign key refuses it, and a store without one keeps a key to nothing.
   `cascade` asks for the rows to go with their target; keeping them means
   redirecting the target's delete too (amended 2026-10-25).
5. A child's `afterDelete` still finds its parent's record in the facts it
   receives, and one write keeps the delete atomic and D-48's statement
   count.
6. A join row is the relation itself, not a record anyone hooks.
7. A self relation, a tree of categories, would otherwise loop.

Rejected:

- a `setNull` written without hooks;
- `restrict` checked after the hooks;
- a cascaded row redirected, which keeps a key to the deleted row, or a
  redirected model refusing the delete as `restrict` does (amended
  2026-10-25);
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

Amended by D-204.

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

Amended by D-172.

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

Amended by D-105, D-132 and D-234.

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
   A check with `lock` locks the rows it counts, as `Read.lock` (point 2;
   amended 2026-10-25).
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
   without update hooks: the check `{ where: and(where, readable), count: 1,
lock: true }` stands for it, and an empty read after the update is
   `NOT_FOUND` (D-104, amended 2026-10-25). The check locks the row as the
   read would (amended 2026-10-25). A relation written from the other side, on a model
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
9. A write that loads no row (amended 2026-10-25) decides from what
   PostgreSQL checks again after a row lock it waited on, never from the
   statement's snapshot alone: under READ COMMITTED, a statement that waits
   on a row lock reads the row's new version for that row only, and the
   other parts of the statement still see the snapshot. So a check that
   stands for a loaded row locks it (point 5), and a cascade level deletes
   among the rows the level above removed (D-102). A shortcut that saves a
   round trip is weighed by this rule first. A row a write reads to choose
   what it changes is read locked, as `move()`, the cascades and a
   many-to-many `disconnect` read theirs: a row hidden or changed before the
   write could go on is then left as it now is (amended 2026-10-25).

Why:

- A check as its own `count` costs a round trip per connected model, and a
  write that checks inside its statement needs no transaction to undo
  itself: nothing runs when a check fails.
- Without a lock, a concurrent write can change a row between the read that
  allowed a write and the write.
- Most writes in an application are a `create` or a Master `update` with no
  hook: they become one round trip.
- A Master update by id checked its row on the snapshot, then updated by
  `id` alone: a row another transaction hid from `beforeFind` while the
  update waited on its lock was updated and returned. A locked check sees
  the hidden row, counts 0, and nothing of the write runs, its nested
  writes included.

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
- Putting `and(where, readable)` in the update's own `where` instead of a
  locked check: the update would skip the hidden row, but the write's
  nested changes, such as a link to it, would still run, and the read
  after it, by `id`, would return the row as it was.

Limits:

- A check runs with the write, so its `NOT_FOUND` comes after the errors
  the kernel finds before writing: a Master update of a missing row with
  invalid data fails with `VALIDATION_FAILED`, a connect to a missing row
  after a move refused as `FORBIDDEN`.
  Example of a locked check, Master's update by id of a `Doc` hidden by
  `beforeFind` when archived:

```sql
-- Before: the snapshot's count
(select count(*) from "doc" as "t1"
  where "t1"."id" = $1 and "t1"."archived" = false) = 1 as "c0"
-- After: the count of the rows it locked, checked again after a wait
(select count(*) from (select from "doc" as "t1"
  where "t1"."id" = $1 and "t1"."archived" = false for update) as t) = 1 as "c0"
```

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

Amended by D-104 and D-135.

Choice:

1. When no model a `delete` reaches has delete hooks or a `redirect`, no
   `setNull` model has update hooks, and no cascade comes back to a model
   it left, the kernel loads no row of the reach. The root is deleted by
   its `where`, then each level by the rows the level above removed
   (amended 2026-10-25):
   - a `cascade` model is deleted where its key names a row the delete of
     its parent removed, `{ writer: { removedBy: 0 } }`: the index of that
     change in the write. Its levels follow, the root first;
   - a `setNull` relation then empties its key and moves `updatedAt` on the
     rows whose key names a removed row;
   - a `restrict` relation is a check with a count of 0, from the root's
     `where` (`{ author: { is: … } }`), on the rows the delete leaves, which
     fails as `RELATION_RESTRICTED`, naming the model and the field (D-90).

   `removedBy` is in the adapter contract (D-73) for a stored `one` key; a
   `where` from a query never holds it. A model the reach both deletes and
   empties, or empties through two relations, loads its rows: two changes
   of the same rows in one statement have no defined order in PostgreSQL.

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

Each level follows the rows the level above removed, as the database's own
`on delete cascade` does, rather than a filter on the rows as they were
(amended 2026-10-25). A delete that waits on a row another transaction
changes skips it when it no longer matches, while a filter decided before
the wait still took its children: a writer renamed out of a delete's
`where` kept its row and lost its novels, and a novel moved to another
writer lost its chapters (audit 3).

Rejected:

- the database's `on delete` actions, which would run the cascades a second
  time when a hook needs them (D-54);
- locking the root before the write (A of audit 3): 4 round trips for
  Master, and a level below the root still lost its children;
- loading and locking every level, as the hooked path: one round trip per
  level again;
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
//     "#w0" as (delete from "writer" where "id" = $1
//       and (select "c0" from "#checks") returning *),
//     "#w1" as (delete from "novel" where "writer_id" in
//       (select "id" from "#w0") and (...) returning *)
//   select "c0", (select ... from "#w0") as "rows" from "#checks"

// Meanwhile, another request renames the writer: the delete waits for it.
await Writer.delete({ where: { code: 'c' } }, { as: master })
// Before: NOT_FOUND, the writer stays, its novels are gone.
// After: NOT_FOUND, the writer and its novels stay.
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
Measured again with `bench/writes`, 1,000 runs, twice with and twice
without: a create took 0.97 ms against 1.07, an update by id 1.07 against
1.19, for about 25 lines of the write compiler; the choice stays (amended
2026-10-25).

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

Amended by D-171 and D-232.

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

   A command that fails exits 1 and says why. An expected failure prints
   its message alone: a refusal (D-119), or an error with a `code`, which
   Node, PostgreSQL, the command line and the kernel's own errors carry.
   Any other error is a bug, and prints its stack. An unknown option adds
   ``Run `npx ultimabase --help`.``, and an unknown command the usage. The
   storage adapter names a server it cannot reach, since it alone knows the
   address, and never prints a password (amended 2026-10-25):

   ```
   $ npx ultimabase sync --forse
   Unknown option '--forse'. Run `npx ultimabase --help`.
   $ npx ultimabase sync
   Cannot reach PostgreSQL at localhost:5432 (ECONNREFUSED): is it running, and is its url right?
   ```

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
   optional; a required scalar field whose `default` is a value, not a
   function, nor `null`. A new required field without such a default,
   unique index or `one`, a field made required and a removed enum value
   are tried: the database refuses them when a row breaks them, and nothing
   is applied. Sync changes the tables' shape and moves no data but one: a
   required field added takes its fixed default in the rows the table held,
   with the column's default dropped in the same transaction, so a create
   still writes the value the kernel validated (D-67). The plan writes the
   same two statements in a `migrate create` file. A function default, such
   as `() => new Date()`, runs at each create and has no value to give old
   rows: the field is tried (amended 2026-10-25). Before, adding
   `done: f.boolean({ default: false })` to a Note holding rows stopped
   `start`; now it logs:

   ```
   Synced Note: added done, false in the rows it held.
   ```

   ```sql
   alter table "note" add column "done" boolean not null default false;
   alter table "note" alter column "done" drop default;
   ```

   A refused change names the statement, what it tried and the database's
   reason (amended 2026-10-22):

   ```
   UltimaBase did not sync Locker: adding the required "Locker.kind" fails when Locker holds rows: make it optional, or give it a value as its default, not a function.
     alter table "locker" add column "kind" text collate "C" not null;
     -- column "kind" of relation "locker" contains null values
   Fix those rows in this development database, or rebuild it from the migrations with `npx ultimabase reset`.
   In production, a migration fixes them: write it with `npx ultimabase migrate create <name>`.
   ```

   Sync's statements run with `set local lock_timeout = '5s'`, as a deploy's
   files do (point 6): a sync waiting behind another session's open
   transaction fails after 5 seconds instead of queueing every query on that
   table behind it, and names what to end (amended 2026-10-25). Before, a
   transaction left open in a database tool made `start` wait without end,
   and every read of the table with it:

   ```
   UltimaBase did not sync Locker: another session held its table.
     alter table "locker" add column "size" integer;
     -- canceling statement due to lock timeout: another query held a table it changes past lock_timeout
   End that session's open transaction, in a database tool perhaps, then try again.
   ```

   The wait for another sync or deploy, the advisory lock, has no limit.

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

   A type change casts the column's values. PostgreSQL converts no value
   between number, boolean and date, from them to json, nor from json to
   date: such a change keeps the column, its indexes and keys, and loses
   its values as an added column has none, null when optional, its fixed
   default when required, and is tried when required without one. A field
   made optional drops `not null` before its type changes. A change from
   text or json to another type reads each value, and is tried (amended
   2026-10-25). Before, changing `done: f.boolean()` to
   `done: f.number({ default: 0 })` failed on any table, an empty one
   included, with `cannot cast type boolean to double precision` and the
   advice to fix rows; now `sync --force` logs:

   ```
   Synced Note: changed done to double precision, 0 in the rows it held.
   ```

   ```sql
   alter table "note" alter column "done" type double precision using 0;
   ```

   A migration file gets the same statement, under
   `-- changing "Note.done" from boolean to double precision deletes its data: PostgreSQL converts no boolean to double precision.`;
   a developer who means a conversion writes it in the `using` clause
   (point 5).

   A date changed to text is written as `toISOString()` writes it, in UTC
   with milliseconds, whatever the session's time zone (amended
   2026-10-25). Before, `2026-10-25T10:00:00.123Z` became
   `2026-10-25 11:00:00.123+01` on a machine in Paris and
   `2026-10-25 19:00:00.123+09` in Tokyo; now it is
   `2026-10-25T10:00:00.123Z` on both:

   ```sql
   alter table "note" alter column "done" type text collate "C"
     using to_char("done" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   ```

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
   ``...: put it in its own file, whose second line is `-- ultimabase no transaction` ``.

   It runs under the advisory lock taken for its session and with no
   `lock_timeout`: `create index concurrently` waits for running
   transactions without blocking any, and one that fails leaves an invalid
   index. A failure then reads
   `It ran without a transaction, so nothing was rolled back: undo what it left, such as an invalid index, then deploy again.`

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
     Its drop waits 5 seconds at most for a table another session holds,
     then drops nothing and prints
     `UltimaBase did not reset the database: another session held a table.`,
     the statement, the reason and the same advice as sync's (point 3;
     amended 2026-10-25).

8. The adapter contract (D-73) gains an optional `migrations` member, which
   the kernel's commands and `start` call; `memory()` has none, since it
   starts empty every time, and the commands say so:

   ```ts
   interface Migrations {
   	/** What this database makes of the models, JSON it validates on read. */
   	snapshot(schema: Schema): unknown
   	/** The statements from a snapshot, none for an empty database, to the
   	 * models' one; a required field added takes its fixed `default` in the
   	 * rows (point 3, amended 2026-10-25). */
   	plan(from: unknown, schema: Schema): readonly Statement[]
   	/** The database's snapshot, and who wrote it. */
   	stored(): Promise<Stored | undefined>
   	/** Runs statements or files, each file in its transaction, then stores
   	 * `to`; throws `MigrationFailed` naming what the database refused. */
   	apply(run: Run): Promise<void>
   	/** Drops every table; returns the models' ones it dropped. A table
   	 * another session holds throws a locked `MigrationFailed` (amended
   	 * 2026-10-25). */
   	reset(): Promise<readonly string[]>
   	/** The database's host when it is not on this machine: `reset` then
   	 * needs `--force` (amended 2026-10-24). */
   	readonly remote?: string
   }
   class MigrationFailed extends Error {
   	/** The statement's SQL, or the file's name. */
   	readonly at: string
   	readonly reason: string
   	/** It waited past its limit for a table another session held, so the
   	 * kernel says what to end, not what rows to fix (amended 2026-10-25). */
   	readonly locked: boolean
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
- A tried change can still fail in production, on rows a development
  database does not have; `migrate deploy` then stops at that file, its
  transaction rolled back. `migrate deploy` on a restored dump tests it
  first.
- `reset` drops tables, not the types or functions a file created.

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

Amended by D-153, D-166, D-204, D-205 and D-223.

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

Amended by D-125, D-128, D-132, D-153, D-185, D-206 and D-227.

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
   2026-10-23). Under it, a document is still refused before it is
   validated, Master's included, when its fields of one response key,
   merged as GraphQL merges them, fragments included, make more than 1,000
   pairs: graphql-js's overlapping-fields rule compares every two of them,
   and 180 copies of `p: posts(first: i) { totalCount }` took 460 ms. The
   pairs within a fragment count once, where it is defined; a chain of
   fragments that spread each other and merge their fields counts more than
   the rule compares, and is refused past about a dozen. A document of a
   caller other than Master with more than 20 root fields, a `totalCount`
   counting one more, is refused before it runs: each is a query or a write
   of its own, which a rate limit counting requests does not see. Both
   bounds are constants. GraphQL Armor was measured and rejected: its peer
   range stops at graphql 16, and its alias and cost limits let 1,990 copies
   of one unaliased field through (amended 2026-10-25).
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

Amended by D-113, D-125, D-150, D-154 and D-175.

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
   returned, since a function is trusted server code (D-27); so are its
   virtuals (D-151), and one `run` left out is read with the relations
   (amended 2026-11-02).
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

Amended by D-133.

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
Later: `upsert` stays as D-20 defers it; `createMany` is D-135.
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

Amended by D-113, D-115, D-160, D-164 and D-165.

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

Amended by D-115, D-125, D-160, D-161, D-162, D-198, D-209 and D-212.

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
    `updatedAt`, `email` nor `password` as a listed field, nor a relation
    (a string list and a JSON field are taken, amended 2026-10-26 by D-120
    and D-125); a required user field missing from the list stops startup,
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

Amended by D-115 and D-161.

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

Amended by D-116 and D-165.

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

Amended by D-162 and D-212.

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

## D-119: `Refused`, the error a command prints without its stack

Choice: completes D-105 point 1.

1. The kernel exports `Refused`, an `Error` named `Refused` that takes what
   `Error` takes. It says the message alone tells what is wrong and how to
   fix it, so a command prints it without a stack (D-105).
2. The kernel, its plugins and its adapters throw it for a configuration
   they refuse while the application is defined or starts, when the message
   names what it refuses: two models named alike, a plugin that requires one
   not listed, an unset url, a server too old, a short master key. A
   community plugin throws it for its own options.
3. An `Error` stays for the rest, whose stack is what locates it: an
   invariant that broke (`Unknown model Book.`), a call at the wrong time
   (`postgres() is not started.`), stored data that is not what the code
   wrote, and a refusal whose message names nothing
   (`definePlugin takes a name.`), which the stack points to in the
   developer's file.

Why: the first errors an application meets are its configuration's, and a
stack into the kernel reads as a crash of the kernel. A `code` cannot mark
them: a refusal never reaches a client, and the codes of D-72 are the
client's. A plugin needs the same way to refuse its options, so the class
is public.
Rejected: one class per package, which the command would have to know
each of; a `code` such as `INVALID_CONFIG`; printing every message without
a stack, which hides a bug's.
Example:

```ts
// Before: a plugin's check
if (options.proxies < 0)
	throw new Error(
		'proxies is -1, not a whole number of proxies in front of the server.',
	)
// After
import { Refused } from 'ultimabase'
if (options.proxies < 0)
	throw new Refused(
		'proxies is -1, not a whole number of proxies in front of the server.',
	)
```

```sh
# Before
$ npx ultimabase sync
Error: postgres() was given no url: is the variable it reads set?
    at Object.start (.../postgres/src/adapter.ts:135:11)
    ...
# After
$ npx ultimabase sync
postgres() was given no url: is the variable it reads set?
```

## D-120: String lists, their filters and their index

Amended by D-127 and D-149.

Choice: completes D-09 and D-52.

1. `f.string({ list: true })` is a list of strings, typed
   `readonly string[]`. A list is never `null`: it is `[]` when nothing is
   written, so `optional` is refused on it. A write replaces the whole list;
   an element is a non-empty string, never `null`.
2. A list filters with `has` (holds this string) and `hasSome` (holds one of
   these strings), Prisma's names; `NOT` gives their opposite. A list cannot
   be sorted, compared with `equals`, nor be `unique`. `hasEvery`, `isEmpty`
   and Prisma's `push` wait for a use.
3. PostgreSQL stores it as `text[] not null`, with no column default
   (D-105; amended 2026-10-26): the kernel writes `[]`, and the rows of a
   list added to a table take `'{}'` or the list's default. `has` is
   `@> array[...]`, `hasSome` is `&&`. `memory()` keeps an array. The
   contract suite runs both. GraphQL shows `[String!]!`, written
   `[String!]`, with a filter input of `has` and `hasSome`.
4. `indexes: [{ fields: ['tags'] }]` gives a list a GIN index, the kind
   PostgreSQL uses for `@>` and `&&`: `create index "post_tags_idx" on
"post" using gin ("tags");`. An index on a list holds that list alone, and
   `unique` is refused on it. A list gets no index by itself: GIN slows every
   write of the row.

Why: tags, labels and an ACL's entries (D-124) are lists of strings, and a
list in the row reads in the row's query, where a join table needs one more.
A GIN index turns `&&` from a scan of the table into an index lookup; an ACL
filters every read through it, so it must exist from the first release.
Rejected: lists of other types in this decision (decided before 0.1, on
the roadmap); a `string[]` stored as `json` (no index, no filter); a join
table for an ACL; `btree_gin`, an extension, to mix a list and a scalar in
one index.
Example:

```ts
// Before: tags as a many-to-many relation, a join table and a join per read
fields: (f) => ({ tags: f.many(() => Tag) })
await Post.findMany({ where: { tags: { some: { name: 'ts' } } } })

// After
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ tags: f.string({ list: true }) }),
	indexes: [{ fields: ['tags'] }],
})
await Post.findMany({ where: { tags: { has: 'ts' } } })
await Post.findMany({ where: { tags: { hasSome: ['ts', 'node'] } } })
```

## D-121: Plugins complete a user caller

Amended by D-126.

Choice: completes D-15 and D-19, which promise plugin keys on the caller.

1. A plugin may give `definePlugin` a `caller` part: given a user caller and
   its context, it returns the plugin's keys, such as `{ roles }` (D-123). It
   runs for a user caller only; anonymous and Master callers get no plugin
   key in 0.1.
2. A plugin types its keys by declaration merging, as the user model is
   (D-62): `declare module 'ultimabase' { interface UserCallerKeys { ... } }`.
   `Extract<Caller, { kind: 'user' }>` then holds them, required.
3. The kernel completes a user caller the first time it receives one: from
   Identify, in an operation's `as`, or in a function call. It runs every
   plugin's `caller`, in the order of `plugins`, and keeps the completed
   caller for that object, so a request pays once, and every hook, rule and
   function sees the completed one. A key two plugins return stops the
   request with a message naming both.
4. Code that builds a user caller (auth's Identify, `asUser` in tests) builds
   `{ kind: 'user', user }`, typed `Identity`: `as` takes one and a
   plugin's `identify` returns one; rules, hooks and functions read the
   completed `Caller`. A caller already completed is not completed again: a
   role given during a request counts from the next request.

Why: Identify belongs to the one plugin that knows the request (D-112); the
roles of a user are another plugin's, and an access rule is synchronous
(D-76), so its keys must be read before the rules run. Completing in the
kernel, on the object, covers the callers no request built (a script, a
test) without each builder knowing every plugin.
Rejected: a second Identify chain (the first plugin to answer wins, D-112);
asynchronous rules that query the roles; keys on anonymous callers now
(no 0.1 plugin has one; a tenant plugin decides it with its own decision).
Example:

```ts
// The roles plugin (D-123)
declare module 'ultimabase' {
	interface UserCallerKeys {
		readonly roles: readonly { readonly id: string; readonly name: string }[]
	}
}
definePlugin<Roles>({
	name: 'roles',
	manifest,
	caller: async ({ user }, context) => ({ roles: await rolesOf(user, context) }),
})

// An application's rule: the keys are there, synchronously
access: {
	delete: ({ caller }) =>
		caller.kind === 'user' && caller.roles.some((role) => role.name === 'Admin'),
}
```

## D-122: Plugin field types at run time

Amended by D-216.

Choice: completes D-32, typed until now and not run.

1. The kernel exports `defineFieldType`, which a plugin calls once:
   `plugin`, the plugin's name; `stored`, a kernel field (`f.string({ list:
true })`) that says how the value is stored, filtered and indexed;
   `decode` and `encode`, between the stored value and the value code sees
   (an `ACL`, D-124); `schema`, a Standard Schema (D-23) that takes the
   value or its JSON and gives the value; `toJSON`, what a client reads.
2. It returns a field builder (`aclField()`), which a plugin uses in its
   `addedFields` (D-89) or an application imports, as D-32 says. It takes
   `default` only, a value or a function of `{ caller }` (D-53); the stored
   field says whether the field may be `null`, and `null` is stored as is,
   never decoded nor encoded. A default is never the column's (D-105): the
   rows stored before the field get what the stored field gets without
   one, `[]` for a list (amended 2026-10-26). `.with` takes `access` only (D-57).
3. A write runs, in order: the `access` rules, on what the caller sent
   (D-67); the defaults; `schema`, on every written value, a default's
   included and a hook's not (D-67); the hooks, which see the value;
   `encode`; the stored field's check. An encoded value the stored field
   refuses is the plugin's bug: the write throws an error naming the plugin,
   not `VALIDATION_FAILED`.
4. Filters and indexes read the stored form. Only the `where` of a
   `beforeFind` (D-71), a plugin's or the application's, filters a plugin
   field, in its stored form: the ACL's `beforeFind` filters `acl` with
   `hasSome`. No query's `where` or `orderBy` names it in 0.1, from a
   client, from code or as Master, and nothing sorts it.
5. Code, rules and hooks read the value; a transport sends `toJSON`'s.
   GraphQL shows such a field as its `JSON` scalar, written through
   `schema`, and leaves it out of the filter inputs. A typed GraphQL shape
   waits for a field type that needs one.
6. A plugin may add indexes to the models that use it, in the shape of D-52:
   `addedIndexes: [{ fields: ['acl'] }]`.
7. `defineApp` refuses a model whose field type's plugin is not in
   `plugins` (D-32).

Why: D-68 puts plugin field types in 0.1, and the ACL is the first: code
works with an `ACL`, the database with `text[]`, a client with
`{ read, write }`. Storing through a kernel field keeps migrations, filters
and indexes in the kernel and its adapters, which a plugin cannot extend.
One `schema` for every write checks a function's data as a client's, and
`beforeFind` alone is one boundary the types can draw.
Rejected: a raw column type a plugin names (each adapter would have to know
it); an `ACL` code reads as `string[]` and wraps itself; a typed GraphQL
shape now; `schema` for a client's writes only; the field type's own
`optional`, `unique` or `validate`.
Example:

```ts
// Before: an ACL is a list code reads and writes as strings
note.acl.includes('read:user:u_1')
await Note.update({ where, data: { acl: [...note.acl, 'read:user:u_2'] } }, as)

// After
export const aclField = defineFieldType({
	plugin: 'acl',
	stored: (f) => f.string({ list: true }),
	decode: (entries) => ACL.fromEntries(entries),
	encode: (acl) => acl.entries(),
	schema: aclSchema,
	toJSON: (acl) => acl.toJSON(),
})
note.acl.userCan(paul, 'read')
await Note.update(
	{ where, data: { acl: note.acl.allowUser(paul, 'read') } },
	as,
)
```

## D-123: `rolesPlugin()`, `defineRole` and roles inside roles

Amended by D-126, D-213 and D-237.

Choice: amends D-13; Parse's roles.

1. `@ultimabase/roles` exports `rolesPlugin()` and `defineRole`. An
   application has one role model in 0.1: a second `defineRole` stops
   startup. D-13's several role models wait for a use.
2. `defineRole({ name, members: () => User, fields })` builds a model with a
   unique `name` string, `members` (a `many` relation to the users) and
   `inherits` with its inverse `inheritedBy` (`many` relations to roles).
   The user model declares its side, `roles: f.many(() => Role)`, as every
   relation does (D-37), under the name the developer chooses. The
   documentation shows that side next to `defineRole`: without it, startup
   stops (amended 2026-10-26).
3. `Admin.inherits` holding `Moderator` means every member of Admin is a
   moderator, through as many levels as are written. A cycle stops the
   expansion, it does not loop.
4. The plugin completes a user caller (D-121) with `caller.roles`, every role
   the user has, inherited ones included, each `{ id, name }`. It reads them
   as Master in one query: the user's roles and five levels of inheritance,
   which PostgreSQL reads in one statement (D-46). A deeper hierarchy pays
   one more query per five levels (amended 2026-10-26).
5. `hasRole('Admin', 'Editor')` is a ready-made rule (D-10): true for a user
   with one of the roles. Code names a role by its name; an ACL holds its id
   (D-124), so renaming a role keeps its ACLs and breaks the rules that name
   it, which are code.

Why: the maintainer's applications manage rights by role, as Parse does
(D-68), and need roles inside roles from 0.1. Parse's `roles` relation reads
backwards (`Moderator.roles` holds Admin, so Admins are moderators);
`inherits` says it in the direction rights flow. One role model keeps
`caller.roles` one list.
Rejected: Parse's `roles` relation name; several role models now; roles
read on each rule (rules are synchronous, D-76); roles on the user as a
string list, without members or inheritance; one query per level of
inheritance (four for Admin, Moderator, Editor); `WITH RECURSIVE`, one
query at any depth but a new adapter call for one plugin (D-90's "Later");
each role storing every role it inherits, recomputed for every descendant
on each change and wrong when two changes cross; roles cached between
requests, as Parse does, which keeps a removed role until the cache
expires.
Example:

```ts
// Before: Parse
const moderators = await new Parse.Query(Parse.Role)
	.equalTo('name', 'Moderator')
	.first({ useMasterKey: true })
moderators.getRoles().add(admins)
await moderators.save(null, { useMasterKey: true })

// After
export const Role = defineRole({
	name: 'Role',
	members: () => User,
	fields: (f) => ({ color: f.string({ optional: true }) }),
})
export const User = defineUser({
	name: 'User',
	fields: (f) => ({ roles: f.many(() => Role) }),
})
await Role.update(
	{
		where: { id: admin.id },
		data: { inherits: { connect: { id: moderator.id } } },
	},
	{ as: master },
)
export const Post = defineModel({ name: 'Post', fields }).with({
	access: { read: allow.public, delete: hasRole('Moderator') },
})
```

## D-124: `acl()`, per-row rights, and the `ACL` class

Amended by D-126.

Choice: amends D-71; Parse's ACL, stored in one string list.

1. `@ultimabase/acl` exports `aclPlugin()`, `acl()` for a model's `use`, and
   the `ACL` class. `acl({ default })` adds an `acl` field (D-122) and its
   GIN index (D-120). `default` is required: it gives the ACL of a row
   created without one, from the caller. The plugin works without
   `rolesPlugin()` (public and users only); with it, ACLs name roles.
2. An entry is a permission and a subject: `read` or `write` (update and
   delete), and the public (`*`), a user (`user:<id>`) or a role
   (`role:<id>`). Stored: `['read:*', 'read:user:u_1', 'write:role:r_9']`.
   Read by a client: `{ read: ['*', 'user:u_1'], write: ['role:r_9'] }`.
3. Every row has an ACL: a public row lists `read:*` and `write:*`. An
   empty `ACL` lets only Master through, as the rows a model held before it
   used `acl()` get.
4. An operation passes `access` and the ACL both; Master skips both. The
   plugin's `beforeFind` filters `acl` with `hasSome` of the caller's keys:
   `*`, its user and every role of `caller.roles`. A row a caller cannot read
   is absent, at every level.
5. `beforeFind` gets `operation`: `'update'` or `'delete'` for the rows the
   write targets, `'read'` everywhere else. For a write the plugin filters
   on `write` and `read` both: a caller writes the rows it sees. A row
   written without the right is absent, so `update` says it was not found
   and `deleteMany` skips it, in one statement (D-102). A relation written
   from the other side that changes the target's row, its key (D-78), is
   `'update'` of that row, so its `connect` to a row the caller cannot
   write is `NOT_FOUND`, as one it cannot read (D-71); a join's link, which
   leaves the row as it is, and any other connected row are `'read'`. A
   cascade runs no
   `beforeFind` (D-90). `operation` is `'read' | 'update' | 'delete'`, for
   the application's hooks and the plugins' (amended 2026-10-26).
6. Only Master writes `acl`, on create and on update; a client that sends
   it is refused, and a row it creates gets `default`. Server code (a
   function, a hook) changes an ACL as Master, after its own checks: a
   function that shares a note is how a user gives rights. No query filters
   by ACL in 0.1 (D-122).
7. `ACL` is immutable: each method returns a new one. `new ACL()` is empty.
   `allowPublic`, `allowUser` and `allowRole` add, `denyPublic`, `denyUser`
   and `denyRole` remove, given permissions or all of them.
   `publicCan`, `userCan` and `roleCan` read one entry; `users` and `roles`
   list the ids having a permission; `allows(caller, permission)` answers
   for a caller, its roles included, and is true for Master. A user or a
   role is given as `{ id }`; no permission given means both. An id that
   is empty or holds a line break, which no entry holds, throws a
   `TypeError`, so an ACL never stores what `fromEntries` refuses
   (amended 2026-11-03).
   `entries`, `fromEntries`, `toJSON` and `fromJSON` convert it.
8. `acl()` without `default` is refused, by its types and when its model
   is defined. The field's schema takes an `ACL` or a `{ read, write }`
   object, not an array, each subject `*`, `user:<id>` or `role:<id>`.
   `@ultimabase/roles` is a peer dependency: one copy of it keeps the key
   `rolesOf` reads (D-126) (amended 2026-10-26, 2026-11-03).

Why: `access` says what a kind of caller may do on a model; an ACL says who
may see or change one row, which only data can hold (a shared note, a
document of a team). One `text[]` with a GIN index keeps the filter one
index lookup in the row's query. A filter on the write's target keeps the
single statement of D-102, where a hook per row would not, and refuses as
`access.read` does. Ids keep an ACL valid when a role is renamed. A right
to edit a row is not a right to give it away: with Parse's rule, any editor
can remove the owner, share the row or make it public. A function says what
sharing allows, in one place.
Rejected: Parse's rule, where a caller that may write a row may change its
ACL; a rule of `acl({ access })` that opens the field to clients (one
general rule for every way of sharing); Parse's `_rperm` and `_wperm`, two
columns for one filter; an
`authenticated` subject (a role, if an application needs it); ACLs as
relations; a check per row in `beforeUpdate`; write rights without read
(Parse allows them; a write that cannot see its row cannot return it);
a default ACL left implicit; `acl: null` as no restriction (a list is
never `null`, D-120, and a row left without one would be public).
Example:

```ts
// Before: Parse
const note = new Parse.Object('Note')
const acl = new Parse.ACL(user)
acl.setReadAccess(paul.id, true)
acl.setRoleWriteAccess('Compta', true)
note.setACL(acl)
await note.save(null, { sessionToken })

// After
import { ACL, acl } from '@ultimabase/acl'
export const Note = defineModel({
	name: 'Note',
	use: [
		acl({
			default: ({ caller }) =>
				caller.kind === 'user'
					? new ACL().allowUser(caller.user, 'read', 'write')
					: new ACL(),
		}),
	],
	fields: (f) => ({ title: f.string() }),
}).with({ access: { read: allow.public, write: isAuthenticated } })

const note = await Note.create({ data: { title: 'Q3' } }, { as: caller })
note.acl.allows(caller, 'write') // true
await Note.update(
	{ where: { id: note.id }, data: { acl: note.acl.allowUser(paul, 'read') } },
	{ as: caller },
) // refused: only Master writes Note.acl

// Sharing, as Google Docs does: a function checks, then writes as Master
export const shareNote = defineFunction({
	name: 'shareNote',
	input: z.object({ note: z.string(), user: z.string() }),
	output: Note,
	run: async ({ input, caller }) => {
		// Read as the caller: the ACL hides a note it cannot see.
		const note = await Note.findUnique(
			{ where: { id: input.note } },
			{ as: caller },
		)
		if (note === null || !note.acl.allows(caller, 'write'))
			throw new PublicError('NOTE_NOT_SHARED', 'You cannot share this note.')
		return Note.update(
			{
				where: { id: note.id },
				data: { acl: note.acl.allowUser({ id: input.user }, 'read') },
			},
			{ as: master },
		)
	},
}).with({ access: isAuthenticated })
```

## D-125: JSON fields typed from their schema

Amended by D-149.

Choice: amends D-45, D-53, D-107, D-109 and D-113.

1. A `json` field whose `validate` is a Standard Schema with a JSON Schema
   export (D-45) gets exact GraphQL types, from that export as D-109 types a
   function's schema: the model's type, `PostCreateInput`, `PostUpdateInput`,
   the field's filter and `SignUpInput` (D-113). Without `validate`, or with a
   function or a schema without that export, the field stays the `JSON`
   scalar; startup never stops for it.
2. Sides. The output side of the JSON Schema types what a client reads, the
   input side what it writes: `z.string().transform(Number)` reads `Float`
   and is written `String`, and a key with a schema default is optional when
   written (D-53).
3. Names. A field's output type is `{Model}{Field}` (`UserPrefs`), its input
   type `{Model}{Field}Input` (`UserPrefsInput`); nested types take their
   path, as a shared type's do (`UserPrefsAddress`, `UserPrefsAddressInput`),
   and an enum is named from its path (`UserPrefsTheme`). A schema with an
   id, `.meta({ id: 'Address' })`, is the one `Address` and `AddressInput`
   that functions share; one name given two shapes stops startup, naming
   both owners, as D-109 says.
4. What GraphQL cannot type is `JSON` for that piece only: a union other
   than one type with `null`, a key that is not a GraphQL name, a recursive
   schema without an id. A function still refuses those (D-109): its schema
   is written for the API, a field's often for storage first.
5. Filter. A typed field has its own filter, `UserPrefsFilter { equals, not,
in, notIn }`, which takes the input type. The kernel compares the stored
   value, the schema's output: a field whose schema transforms its value
   is filtered by its written shape, which a transformed value may not fit.
6. Sign-up. `signUp` takes a `json` field (D-113). Its input carries the
   schema's input JSON Schema, or none (`JSON`), and the kernel's create
   validates the value. GraphQL types it as any function input (D-109):
   named from its path (`SignUpPrefsInput`) unless the schema has an id, and
   a shape it cannot type stops startup, naming `signUp`.
7. Rows stored before a schema changed may not fit its new output type:
   GraphQL then fails that field when read, with its usual error. Migrating
   such rows is the application's work.
8. REST will type its OpenAPI document from the same JSON Schema.

Why: `validate` already says the exact shape of a field, and functions turn
the same schemas into GraphQL types; a `JSON` scalar left a client's
generated types at `unknown` for no reason. A field's schema is often written
for storage (unions, free keys), so a shape GraphQL cannot type falls back to
`JSON` there instead of stopping startup.
Rejected: `JSON` for every field (the shape is known); stopping startup on a
union in a field; a filter typed from the output side, which needs a third
set of type names for a rare transform; refusing JSON fields at sign-up,
whose input the schema already describes; a function that upgrades an old
shape on read (point 7), whose result the filters, sorting and unique
indexes, which compare the stored value, would contradict; validating every
row on read, a cost each read pays where GraphQL already fails a field that
does not fit.
Example:

```ts
export const User = defineModel({
	name: 'User',
	fields: (f) => ({
		prefs: f.json({
			validate: z.object({
				theme: z.enum(['dark', 'light']),
				size: z.number().default(12),
			}),
		}),
		raw: f.json(),
	}),
})
```

```graphql
# Before
type User {
	prefs: JSON!
	raw: JSON!
}
input UserCreateInput {
	prefs: JSON!
	raw: JSON!
}

# After
type User {
	prefs: UserPrefs!
	raw: JSON!
}
type UserPrefs {
	theme: UserPrefsTheme!
	size: Float!
}
enum UserPrefsTheme {
	dark
	light
}
input UserCreateInput {
	prefs: UserPrefsInput!
	raw: JSON!
}
input UserPrefsInput {
	theme: UserPrefsTheme!
	size: Float
}
input UserWhereInput {
	prefs: UserPrefsFilter
	raw: JSONFilter
}
```

## D-126: A role is asked, never read

Choice: amends D-121's example, D-123 and D-124.

1. Code asks whether a caller has a role; it never reads a list of roles.
   `hasRole('Admin', 'Editor')` stays the ready-made rule (D-10), combined
   with others by `anyOf` and `allOf`. Code outside a rule, a function or a
   hook, asks the same function with the caller first:
   `hasRole(caller, 'Admin', 'Editor')` answers at once. Both are true for a
   user with one of the roles, inherited ones included, and false for an
   anonymous or Master caller.
2. The roles plugin still completes a user caller once (D-121) with every
   role the user has, as D-123 reads them, under a symbol key that
   `@ultimabase/roles` does not export: `caller.` lists no roles. The kernel
   takes a plugin's symbol keys as it takes its string keys.
3. `rolesOf(caller)` gives those roles, each `{ id, name }`, for the code
   that needs the list: the ACL (D-124) reads it, so `@ultimabase/acl`
   imports `@ultimabase/roles`. It gives `[]` for a caller the roles plugin
   did not complete, so the ACL works without `rolesPlugin()`.
4. `hasRole` given a user caller the roles plugin did not complete stops
   with a message saying to add `rolesPlugin()` to `plugins`.
5. The user's side of `members` (D-123) is data: code reads it to show or
   change a user's roles, and adds a member from the role, as Parse does.

Why: D-123 gave two lists named `roles`, the user's relation and the
caller's key, which differ only by the inherited roles; a developer had to
know which one a rule reads. A developer who wrote `Admin.inherits` already
knows that admins are moderators, as in Parse: the question says it.
One
name asks it everywhere.
Rejected: `caller.roles`; the user's relation read by a rule (not loaded
with the caller, direct roles only, D-76); roles kept by the plugin beside
the caller, which leaves its `caller` part returning nothing; a second
name for the question asked outside a rule (two words for one question);
`hasRole` silently false without the plugin, which hides a missing plugin.
Example:

```ts
// Before: Parse
const admins = await new Parse.Query(Parse.Role)
	.equalTo('name', 'Admin')
	.equalTo('users', request.user)
	.first({ useMasterKey: true })
if (admins === undefined) throw new Parse.Error(403, 'Admins only.')

// Before: D-123
access: {
	update: ({ caller, record }) =>
		caller.kind === 'user' &&
		(record.author.id === caller.user.id ||
			caller.roles.some((role) => role.name === 'Admin')),
}

// After
await Role.update(
	{ where: { id: admin.id }, data: { members: { connect: { id: ada.id } } } },
	{ as: master },
)
access: { update: anyOf(isAuthor, hasRole('Admin')), delete: hasRole('Moderator') }

export const publish = defineFunction({
	name: 'publish',
	input: z.object({ post: z.string() }),
	run: async ({ input, caller }) => {
		const featured = hasRole(caller, 'Editor')
		// ...
	},
}).with({ access: isAuthenticated })
```

## D-127: Lists of enums and numbers

Amended by D-150.

Choice: amends D-120, whose rules every list follows.

1. `f.enumOf(values, { list: true })` is typed `readonly E[]` and
   `f.number({ list: true })` `readonly number[]`. Each element is what the
   single field accepts: one of the values, a finite number. A list may hold
   an element twice, as a string list does.
2. `has` and `hasSome` take the element's type. `optional`, `unique` and
   sorting are refused, as on a string list.
3. `f.date`, `f.boolean` and `f.json` refuse `list: true`, by their types
   and when their model is defined: "f.date() makes no list: a list holds
   strings, numbers or enum values."
4. The adapter contract (D-73) gives a list as its element's type and
   `list: true`: `{ type: 'enum', list: true, values }` replaces
   `type: 'stringList'`. An adapter handles "a list of" once.
5. PostgreSQL stores a number list as `double precision[] not null`, an enum
   list as `text[] not null` with a check that its elements are values:
   `check ("days" <@ array['mon', 'tue']::text[])`. GraphQL shows
   `[Float!]!` and `[ShopDays!]!`, with `has` and `hasSome` typed by the
   element.

Why: weekdays, categories and permissions are lists of enum values, sizes
and scores lists of numbers; stored as `json` they have no filter, no index
and no check. A list of booleans means something by position, which named
fields say better. A list of dates has real uses but costs the most: two
equal `Date`s are not `===` in `memory()`, PostgreSQL keeps microseconds
where JavaScript keeps milliseconds, and old dates carry odd offsets (D-47).
Rejected: `numberList` and `enumList` contract types beside `stringList`
(each adapter would handle every pair); lists of dates and booleans in 0.1;
a PostgreSQL enum type for an enum list (D-98 stores enums as text with a
check).
Example:

```ts
// Before: weekdays as json, without a filter, an index or a check
fields: (f) => ({ days: f.json() })

// After
export const Shop = defineModel({
	name: 'Shop',
	fields: (f) => ({
		days: f.enumOf(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], {
			list: true,
		}),
		sizes: f.number({ list: true }),
	}),
	indexes: [{ fields: ['days'] }],
})
await Shop.findMany({ where: { days: { hasSome: ['sat', 'sun'] } } })
await Shop.findMany({ where: { sizes: { has: 42 } } })
```

## D-128: Nested creation, `create` in a relation write

Amended by D-227.

Choice: a relation write takes `create` beside `connect`, in `create` and
`update`, with Prisma's spelling (D-20).

1. On a `one` relation, `create` takes the target's data and stands alone,
   as `connect` does. On a `many` relation it takes a list of them and
   combines with `connect` (and `disconnect` in `update`); like `connect`
   there, it takes no single object.
2. A created row is created as `Target.create` creates it for the same
   caller: its `create` rule, its field rules, its defaults, its validation
   and its `beforeCreate` hooks. It is then connected as `connect` connects
   it: the key goes on the side that stores it (D-37), a many-to-many writes
   its join row, and a one-to-one already held is refused as with `connect`.
   When the created row stores the key, its data holds the relation as
   `{ connect: { id } }`, which its rules and hooks see (D-77).
3. The created row's data never holds the relation back to the row written:
   the types leave it out, and the kernel refuses it with `INVALID_QUERY`
   (`data.comments.create.0.post`). GraphQL names that input as Prisma
   does: `CommentCreateWithoutPostInput`. Each relation then has its own
   write inputs, named after its target and the relation back, instead of
   the shared ones of D-107: `CommentCreateNestedManyWithoutPostInput
{ connect, create }`, `CommentUpdateManyWithoutPostNestedInput
{ connect, disconnect, create }`, `PostCreateNestedOneWithoutCommentsInput
@oneOf { connect, create }`, and `PostUpdateOneWithoutCommentsNestedInput
@oneOf` with `disconnect: Boolean` on an optional `one`, or
   `PostUpdateOneRequiredWithoutCommentsNestedInput` without it on a
   required one. A model hidden from the root fields (`graphql: false`) is
   read and connected through a relation, never created through one: its
   relation inputs take no `create`, as Parse offers no `createAndLink` to a
   class whose create mutation is off. Hiding a model closes every GraphQL
   path that creates it; server code still creates it nested (amended
   2026-10-26).
4. A created row may create rows in turn, at any depth.
5. Rules and hooks run depth first, in written order: the written row's
   first, so its `beforeCreate` or `beforeUpdate` may change or add the rows
   it creates, then each created row's. The rows are then written at once,
   in one adapter write. The `after*` hooks follow in the same order, the
   `*Commit` hooks after the commit. A created row's `beforeCreate` knows
   the key of the row it hangs from, which is not stored yet.
6. A refused or invalid created row fails the whole write. A
   `VALIDATION_FAILED` issue gives the path from `data`:
   `['comments', 'create', 0, 'body']`.
7. The field rule of the relation written sees the created rows by id, as
   D-86 shows connected ones: `{ id }` on a `one`, and on a `many` a third
   list, `{ connect, disconnect, create }`. The kernel makes those ids before
   the rules run (D-22).
8. A `create` that a default or a hook writes skips access rules, as its
   `connect` would (D-67); its defaults, validation and hooks still run.

The adapter contract (D-73) is unchanged: a write already holds several
inserts, the row pointed to inserted first.
Why: creating a post and its comments takes one call and one write instead
of one per row and a `transaction()`. Every rule a created row meets is one
`Target.create` already applies, so nested creation opens no way around a
rule. A field rule that did not see created rows would let a caller add rows
to a relation it may not change. Prisma limits neither the depth nor the
order; the GraphQL depth limit and the request size bound a client.
Later (D-20): a nested `createMany` and a nested `upsert`; `connectOrCreate`,
`set`, `update` and `delete` came with D-138.
Rejected: one level of nesting only (code for an arbitrary rule); a single
object on a `many` (`connect` takes a list there); the created rows' rules
skipped because the caller writes the parent; a field rule blind to
created rows; a GraphQL input per model with every relation (it would let a
client write the relation back).
Example:

```ts
// Before: three calls, atomic only inside transaction()
const post = await Post.create({ data: { title: 'Hello' } }, { as: caller })
for (const body of ['a', 'b']) {
	await Comment.create(
		{ data: { body, post: { connect: { id: post.id } } } },
		{ as: caller },
	)
}

// After: one write, Comment's rules and hooks run on each comment
await Post.create(
	{
		data: {
			title: 'Hello',
			comments: { create: [{ body: 'a' }, { body: 'b' }] },
		},
		include: { comments: true },
	},
	{ as: caller },
)
await Comment.create({
	data: { body: 'x', post: { create: { title: 'New' } } },
})
await User.update({
	where: { id },
	data: { profile: { create: { bio: 'Hi' } } },
})

// Refused: the post is the one being created
await Post.create({
	data: {
		title: 'Hello',
		comments: { create: [{ body: 'a', post: { connect: { id } } }] },
	},
}) // INVALID_QUERY data.comments.create.0.post
```

```graphql
mutation {
	createPost(data: { title: "Hello", comments: { create: [{ body: "a" }] } }) {
		id
	}
}
```

## D-129: `restPlugin()`, the REST API as GraphQL's twin

Amended by D-142.

Choice: completes D-25, D-27, D-55, D-68 and D-106. One rule shapes the
REST API: each parameter is named after the GraphQL argument it stands
for, and each response is the JSON the matching GraphQL field returns.
Error codes, limits and plugin options are GraphQL's too (D-107). Only
HTTP's own grammar differs: verbs, paths and statuses.

1. `@ultimabase/rest` exports `restPlugin(options)` and the model entry
   `rest()`. It requires `httpPlugin` (D-106) and mounts its routes with
   `mount(routes)` as D-107 does, under `/api` (`path` option).
2. Routes of a model, under its plural, computed as GraphQL computes it:

   | Route                   | GraphQL field             | Success                |
   | ----------------------- | ------------------------- | ---------------------- |
   | `GET /api/posts`        | `posts(...)`              | 200, the list          |
   | `GET /api/posts/:id`    | `post(where: { id })`     | 200, the row           |
   | `POST /api/posts`       | `createPost(data)`        | 201, the row           |
   | `PATCH /api/posts/:id`  | `updatePost(where, data)` | 200, the row           |
   | `DELETE /api/posts/:id` | `deletePost(where)`       | 200, the row as it was |

   A row the caller cannot find or read is `404 NOT_FOUND` (D-72), where
   GraphQL's `post` gives `null`; `updatePost` and `deletePost` already fail
   with `NOT_FOUND`. A row is named by its `id` in the path only; another
   unique field is read with a list and `where`. No `updateMany` or
   `deleteMany`, as in GraphQL.

3. Parameters. Each query parameter holds the JSON of the GraphQL argument
   of the same name: `where`, `orderBy` (one object or a list), `first`,
   `after`, `last`, `before`, or `take` and `skip` with
   `restPlugin({ pagination: 'list' })`. A string argument (`after`,
   `before`) is written as is. The filters are GraphQL's, which are the
   query API's (D-20): `equals`, `gt`, `contains`, `some`, `AND`… A body
   is JSON; D-106 refuses a form.
4. Fields. GraphQL's selection becomes `select` or `include`, the query
   API's (D-20), never both. Without either, a row holds its readable
   scalar fields and no relation. A `many` relation included takes the
   GraphQL relation field's arguments and returns what it returns: a
   connection, or a list with `pagination: 'list'`.
5. Lists are Relay connections by default, as in GraphQL (D-41):
   `{ edges: [{ cursor, node }], pageInfo: { hasNextPage, hasPreviousPage,
startCursor, endCursor } }`, with `totalCount` when the request has
   `totalCount=true`, since GraphQL counts only when `totalCount` is
   selected. `pagination: 'list'` returns a plain array, as
   `posts(take, skip): [Post!]!` does.
6. Writes. The body of `POST` and `PATCH` is the mutation's `data`,
   relation writes included (`connect`, `disconnect`, `create`, D-128);
   `select` and `include` stay in the query. A create or update returns the
   written row even when a read rule would hide it (D-86); a delete returns
   `DeletedPost`, without relations (D-102).
7. Values are GraphQL's JSON: `DateTime` as ISO 8601 text, read back to a
   `Date` from the field's type; `JSON` fields as JSON; enums as their
   text.
8. Functions (D-27, D-109, D-113) are at `/api/functions/:name`, named as
   in GraphQL and set apart by `.with({ rest: { name } | false })`. A
   `query: true` function is a `GET` whose input keys are query parameters,
   as GraphQL's arguments, each the JSON of its value, a string as is;
   another is a `POST` whose body is its input. The response is the
   function's output, the value of GraphQL's `data.signUp`. Plugin
   functions such as `signUp`, `signIn` and `viewer` are exposed as the
   application's are.
9. A model whose `use` lists `rest()` takes `.with({ rest: { plural, maxTake } })`
   or `.with({ rest: false })`. A hidden model has no routes; an exposed
   model's `include` reads it and its relation writes connect it, never
   create it, as D-128 says for GraphQL. Two models with one plural, or a
   plural `functions`, are refused at start.
10. Limits (D-55) are `graphqlPlugin`'s, by name and value, for callers
    other than Master: `take` 100 rows when a list asks for none,
    `maxTake` 100, `maxDepth` 10 levels of `select` and `include`, and
    `maxRows` 20 000 rows per request, counted as D-107 counts them, set as
    `restPlugin({ take, maxTake, maxDepth, maxRows })` and per model.
11. Errors, CORS, the body limit and `Cache-Control: no-store` are D-106's:
    `{ code, message, details }` with D-72's statuses, the same codes a
    GraphQL error carries in `extensions.code`.

Why: an application exposes both transports to the same developers, and
most of them call REST (D-68). One vocabulary, the query API's, serves
server code, GraphQL and REST, so a client moves between them without a
second one to learn. Resource paths keep REST's grammar, which a Parse
developer knows, without Parse's words.
Later: an OpenAPI document, batched requests, a `POST` read for a `where`
too long for a URL, `upsert` and aggregates.
Rejected: Parse's API (`/classes/Post`, `$gt`, `order=-createdAt`,
`limit`), a second vocabulary; ZenStack's RPC paths
(`/post/findMany?q=`), a function call dressed as a URL; PostgREST's
operators (`likes=gt.10`), a third vocabulary; `take` and `results` by
default, unlike GraphQL's lists; a unique lookup on any unique field in the
path (`/posts/unique?where=`), a route REST clients do not expect.
Example:

```ts
// Before: Parse, its own words
await fetch(
	'/parse/classes/Post?where={"likes":{"$gt":10}}&order=-createdAt&limit=10&include=author',
)
// → { results: [{ objectId, title, author: { … } }] }

// After: GraphQL's arguments and response
await fetch(
	'/api/posts?where={"likes":{"gt":10}}&orderBy={"createdAt":"desc"}&first=10&include={"author":true}',
)
// → { edges: [{ cursor, node: { id, title, author: { … } } }], pageInfo: { … } }

await fetch('/api/posts?include={"author":true}', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ title: 'Hi', author: { connect: { id: 'u1' } } }),
}) // 201 { id, title: 'Hi', author: { … }, … }

await fetch('/api/functions/signUp', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ email: 'ada@example.com', password: '…' }),
})
```

```graphql
# The same list over GraphQL
{
	posts(where: { likes: { gt: 10 } }, orderBy: { createdAt: desc }, first: 10) {
		edges {
			cursor
			node {
				id
				title
				author {
					name
				}
			}
		}
		pageInfo {
			hasNextPage
		}
	}
}
```

## D-130: `testApplication(app)` and `npm create ultimabase`

Amended by D-137, D-168 and D-177.
Amended 2026-10-30: the starter runs `ultimabase dev` and `ultimabase start`.

Choice: completes D-40, D-61 and D-80.

1. `@ultimabase/testing` exports `testApplication(app)`, called once at the
   top of a test file with the value `defineApp` returned. It declares
   Vitest hooks: before each test, the application starts with its own
   models, plugins, functions and master key on a new `memory()`, whatever
   database it declares; after each test, it stops.
2. While a test runs, the application's info lines are dropped; its warnings
   and errors still reach its logger. `PORT` is `0` while it starts, so
   `httpPlugin()` listens on a free port and test files run in parallel; an
   explicit `port` option still wins. `testApplication` returns `{ url }`,
   the server's address during a test, which throws without `httpPlugin`.
3. The kernel gives what this needs on `ultimabase/internal`, a subpath
   only official packages import and the documentation does not show.
4. D-40 loses two promises. The conformance suites for plugin authors wait
   for a plugin contract beyond the types; only adapters have one (D-94).
   Nothing starts Docker: PostgreSQL tests take `TEST_DATABASE_URL`, and
   application tests run on `memory()`.
5. `create-ultimabase` writes D-61's starter: `npm create ultimabase
<directory>` (or `yarn create`, `pnpm create`). Without a directory it
   asks for its name in a terminal and takes `my-app` elsewhere; the
   directory's name is the package's. It refuses a directory that is not
   empty, installs nothing, and prints the next commands for the package
   manager that ran it. It asks nothing else.
6. The starter holds `src/models.ts` (a public `Post`), `src/app.ts`
   (`memory()`, `httpPlugin()`, `graphqlPlugin()`), `src/app.test.ts`
   written with `testApplication`, `ultimabase.config.ts`, which
   default-exports the application, `package.json`, `tsconfig.json`,
   `.gitignore` and a short README. Its scripts are `dev`
   (`ultimabase dev`), `start` (`ultimabase start`) and `test` (`vitest`),
   so the command a host runs starts in production and checks the database
   instead of syncing it (D-105); it has no `src/server.ts`, and the CLI
   prints `npm run dev` as the next command. Node runs its
   TypeScript, with no build. Comments in `src/app.ts` say where PostgreSQL
   and REST go; the starter depends on nothing it does not run, except
   `@types/node`, which its editor needs for `process` and `node:` imports
   since TypeScript 6 includes no types by default. Its
   UltimaBase packages take `create-ultimabase`'s own version (D-60).
7. The starter's files live in the package as a real application: the
   repository typechecks them and runs their test, and the package's test
   writes a starter and starts it.

Why: a test of the application as declared checks its real rules, and one
line keeps tests from building their own setup. Each question in a starter
multiplies the projects to keep working, and changing one line of
`app.ts` replaces any answer.

Rejected: a test application built by the developer from a database
argument; an in-memory `fetch` without a port, as in the previous base;
questions for the database, the transports or sign-in; optional packages in
the starter's dependencies.

Example:

```ts
// Before: each test file builds and runs its own application
const test = defineApp({
	database: memory(),
	plugins: [httpPlugin({ port: 0 }), graphqlPlugin()],
	models: [Post],
})
beforeEach(() => test.start())
afterEach(() => test.stop())

// After: the application itself, on a fresh memory() per test
import { app } from './app.ts'
const running = testApplication(app)

it('creates a post', async () => {
	await Post.create({ data: { title: 'Hello' } }, { as: master })
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: '{ posts { edges { node { title } } } }' }),
	})
	expect(await response.json()).toEqual({
		data: { posts: { edges: [{ node: { title: 'Hello' } }] } },
	})
})
```

```jsonc
// Before: `npm start` runs src/server.ts, which syncs the database, as in development
"scripts": { "start": "node src/server.ts", "test": "vitest" }

// After: `npm start` runs in production, and `npm run dev` restarts on each change
"scripts": { "dev": "ultimabase dev", "start": "ultimabase start", "test": "vitest" }
```

```text
$ npm create ultimabase
? Project name: (my-app) blog

Created blog. Next:

  cd blog
  npm install
  npm run dev
```

## D-131: One example per feature, tested as an application, and Changesets

Choice: amends D-31's example tests; completes D-60.

1. `examples/` holds one small application per feature of 0.1, beside
   `password-sign-in`:
   - `relations`: one, many and many-to-many relations, nested creation and
     `onDelete`;
   - `functions-and-hooks`: `defineFunction`, a hook and `transaction`;
   - `roles-and-acl`: `rolesPlugin()`, `defineRole` and `aclPlugin()`;
   - `soft-delete`: `softDeletePlugin()`;
   - `rest`: `restPlugin()` beside `graphqlPlugin()`, one model through both;
   - `postgres`: `postgres()`, its migrations, `ultimabase dev` and
     `migrate deploy`.
     Each runs on `memory()` unless the database is its feature, and has a
     README of a few lines saying what it shows.
2. An example's test is written as an application's: `testApplication(app)`,
   requests over HTTP to `running.url`, and data set up in the test as
   Master. `password-sign-in`'s test moves to it.
3. One repository test keeps D-31's promise that each example starts as
   `yarn start` does: it runs every example's `node src/server.ts` on
   `PORT=0`, waits for its `Listening on` line, stops it with `SIGTERM` and
   expects its `Application stopped.` line, then its end on the signal it
   sends itself again (D-91). `postgres` starts in `yarn test:postgres`
   only: its `app.postgres.test.ts` deploys its migrations into a schema of
   its own on `TEST_DATABASE_URL`, then starts it.
4. The same repository test refuses an example without a `start` script of
   `node src/server.ts`, without a test, or whose `tsconfig.json` is missing
   from `yarn typecheck`.
5. Changesets (`@changesets/cli`) versions the packages: one `fixed` group
   holds every package under `packages/` (D-60); the examples are left out;
   the default changelog. The repository holds one changeset, the first
   release, `0.1.0`. Until it is published every change is part of it, so no
   other changeset is written and none is required; CI requires one per pull
   request from the first publication. Running `changeset version` and
   `changeset publish`, and making the packages public, belong to the
   publication step.

Why: D-31 promises one folder per feature, and one example covers a fraction
of 0.1. An example's test is the code a developer copies; with
`testApplication` it is the starter's, without forty lines that spawn and
watch a process. One test that starts every example keeps the check those
lines made. Changesets moves twelve version numbers and their changelog
together, which a script would otherwise do by hand.

Rejected: each example spawning its own server; one example per package
rather than per feature; a changeset on every change before the first
release, whose entries would all read "part of 0.1"; independent versions
(D-60).

Example:

```ts
// Before: examples/password-sign-in/src/app.test.ts spawns the server
beforeAll(async () => {
	server = spawn(process.execPath, ['src/server.ts'], {
		env: { ...process.env, PORT: '0', MASTER_KEY: masterKey },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	url = await new Promise((resolve, reject) => {
		server.stdout.on('data', (chunk) => {
			output += String(chunk)
			const found = /Listening on (\S+)\./.exec(output)?.[1]
			if (found !== undefined) resolve(found)
		})
		server.once('exit', (code) => reject(new Error(`Exited with ${code}`)))
	})
})
// …and makes an editor over GraphQL with the master key.

// After: the application itself, as the starter's test is written
import { app } from './app.ts'
const running = testApplication(app)

it('lets an editor delete anyone’s post', async () => {
	await User.update({ where: { id }, data: { editor: true } }, { as: master })
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...signedIn(editor) },
		body: JSON.stringify({ query: deletePost, variables: { id: post.id } }),
	})
	expect(await response.json()).toEqual({
		data: { deletePost: { id: post.id } },
	})
})
```

```text
examples/
  password-sign-in/  relations/  functions-and-hooks/  roles-and-acl/
  soft-delete/       rest/       postgres/
.changeset/
  config.json        first-release.md   ("ultimabase": minor, …)
```

## D-132: Integer fields, and number updates computed on the locked row

Choice: completes D-09; amends D-20, D-98 point 2 and D-107's scalars.

1. `f.number({ integer: true })` is a whole number from -2,147,483,648 to
   2,147,483,647: `integer` on PostgreSQL, `Int` in GraphQL, the same bounds
   on `memory()`. `integer: true` also applies with `list: true` (D-127),
   as `integer[]` and `[Int!]`. A value with a fraction or out of bounds
   fails with `VALIDATION_FAILED` and the field's path, whichever API sent
   it. A filter on the field takes the same whole numbers, as GraphQL's
   `Int` does, and fails with `INVALID_QUERY` otherwise (D-20).
2. On a `number` field, `update` and `updateMany` take one operation instead
   of a value: `{ set }`, `{ increment }`, `{ decrement }`, `{ multiply }`
   or `{ divide }`, as in Prisma. `{ set: 3 }` is `3`, and `{ set: null }`
   clears an optional field. On an integer field the operand is an integer.
   The types refuse an object with two operations or none; at run time it
   fails with `INVALID_QUERY` (D-20). `{ increment: undefined }` leaves the
   field unchanged (D-84).
3. The kernel computes the new value on the row the update locks (D-99
   point 2, D-104), before the rules: a field rule's `value` (D-44), the
   validation (D-23), `beforeUpdate`'s `data` and `afterUpdate`'s `record`
   all see the number the row will hold, never the operation. A hook that
   assigns `data.stock` assigns a number.
4. When the kernel loads no row (D-99 point 5: Master, by `id`, a model
   without update hooks), the adapter computes it in the write
   (`stock = stock - 3`), atomic in its statement. A field with `validate`
   needs the new value, so an operation on it loads the locked row: only
   then does the operation add a transaction.
5. An operation on `null` starts from 0. Dividing by 0 fails with
   `VALIDATION_FAILED` before any query. On an integer field, `divide`
   truncates toward zero, as PostgreSQL does (`7 / 2` is 3). A result out of
   bounds, or not finite on a float field, fails with `VALIDATION_FAILED`.
6. Operations are part of the server API only. GraphQL and REST keep plain
   values: REST refuses an object for a number field as bad input, and
   `PostUpdateInput` keeps `Float` or `Int`. A client's counter belongs in
   a function (D-27), which applies its own logic.
7. Changing a `number` field to `integer: true` is tried (D-105 point 3): a
   stored value with a fraction or out of bounds refuses it, and nothing is
   applied. The other way loses nothing.

Why:

- Reading a number, computing in JavaScript and writing it back loses
  updates under concurrency: in `examples/functions-and-hooks`, two orders
  of 1 placed at once against a stock of 10 left 9, not 8 (PostgreSQL 18).
- The row is already locked before the rules and hooks run, so computing on
  it costs nothing more, and every rule, schema and hook keeps seeing the
  value it sees today. A rule that limits a step compares `value` with
  `record`.
- GraphQL cannot type a field that is either a `Float` or an object, so
  exposing operations there would turn every number input into an object.
  Parse Server's GraphQL never exposed `Increment`, only its REST did.
- `Int` is 32 bits in the GraphQL specification; bigint waits for a need
  (D-09).

Rejected:

- Hooks and validation seeing the operation (`{ increment: 1 }`): every
  hook, rule and schema would handle two shapes.
- Prisma's `null` left unchanged by an operation: a counter that never
  counts, without an error.
- Operations in GraphQL as `NumberUpdate @oneOf`, or as Hasura's separate
  `_inc` argument, which REST and the server API do not have (D-129).
- `f.int()`: a second builder for one option of `number`.

Example:

```ts
// Before: examples/functions-and-hooks, Order's afterCreate
const product = await Product.findUnique({ where }, { as: master })
const stock = (product?.stock ?? 0) - record.quantity
if (stock < 0) throw new PublicError('OUT_OF_STOCK', 'Out of stock.')
await Product.update({ where, data: { stock } }, { as: master })

// After: the decrement in Order's afterCreate…
await Product.update(
	{ where, data: { stock: { decrement: record.quantity } } },
	{ as: master },
)
// …and the check in Product, which sees the new stock
stock: f.number({ integer: true, default: 0 }),
beforeUpdate: ({ data }) => {
	if (data.stock !== undefined && data.stock < 0) {
		throw new PublicError('OUT_OF_STOCK', 'Out of stock.')
	}
},
```

```ts
await Post.update({ where: { id }, data: { likes: { increment: 1 } } })
await Post.update({ where: { id }, data: { likes: { set: 0 } } }) // = likes: 0
await Post.update({
	where: { id },
	data: { likes: { increment: 1, decrement: 1 } }, // type error: one operation
})
```

## D-133: `updateMany` runs an update's rules and hooks on each row

Amended by D-149.

Choice: completes D-20 and D-48; amends D-111.

1. `Model.updateMany({ where, data }, { as })` updates every row `where`
   selects that the caller reads, and returns `{ count }`, as in Prisma.
   Without `where` it selects every such row. It takes no `take`, `orderBy`
   or `select`.
2. `data` is what `update` takes for the fields of the row: values, `null`,
   and the number operations of D-132, computed on each row. Relation
   writes (`connect`, `disconnect`, `create`) are refused: the types leave
   them out, and at run time they fail with `INVALID_QUERY` (D-20), as
   Prisma's `updateMany` refuses them.
3. Each row goes through what an `update` runs (D-48, D-67): the `update`
   rule on its record and its data, the field rules (D-44), the defaults
   and validation, `beforeUpdate`, `afterUpdate` and `afterUpdateCommit`.
   Each row's hooks get their own copy of `data`, so a hook that changes it
   for one row leaves the others as sent.
4. It is all or nothing, as `deleteMany` (D-111): the rules run on every
   row before any hook, and one row refused fails the whole call with
   `ACCESS_DENIED`; a failed validation, a hook's error or a
   `UNIQUE_VIOLATION` (D-72) fails it too, and nothing is written. A row the caller
   cannot read is left out (D-72), and no row matching is `{ count: 0 }`.
5. When nothing needs the stored rows, as for `update` (D-99): Master's
   call on a model without update hooks, whose number operations touch no
   field with `validate`, it is one write: one `UPDATE ... WHERE`, the
   number operations computed in it, and the count from the rows it
   changed (D-104). Otherwise the rows are loaded locked in the write's
   transaction: BEGIN, one read, the writes, COMMIT. Rows whose data come
   out the same share one statement, and a number operation no hook
   changed stays computed in SQL, so `{ increment: 1 }` on a thousand rows
   is one `UPDATE`.
6. A locked read of many rows, `updateMany`'s and `deleteMany`'s, locks
   them in `id` order and runs their hooks in that order: two calls that
   lock the same rows wait on each other instead of deadlocking.
7. It is server code: neither GraphQL nor REST exposes it, as `deleteMany`
   (D-111 point 4, D-129). A plugin's `queries` (D-89) have it, as they
   have `deleteMany`.

Why:

- Marking a user's notifications read, closing the open tickets of a
  project or crediting every member is today one `findMany` and one
  `update` per row: N round trips and N transactions, where a rule refused
  halfway leaves half the rows written.
- The kernel already locks many rows and runs a hook per row for
  `deleteMany` and cascades, and `update` already computes numbers on a
  locked row or in SQL: `updateMany` adds an entry point, not a pipeline.
- PostgreSQL locks the rows of a `SELECT ... FOR UPDATE` in the order it
  reads them: two calls that read them in different orders can deadlock,
  and an `ORDER BY id` costs nothing on the primary key.

Limit: the one-write case counts the rows its update changed (D-104), and
two such writes on the same rows may still deadlock, as two `UPDATE`
statements may in PostgreSQL; the database aborts one and the call fails.

Rejected:

- Prisma's `updateManyAndReturn`, until an application needs the rows; a
  `findMany` with the same `where` reads them.
- A batch hook that receives every row at once, which a plugin written for
  `update` would miss (D-111); skipping rules or hooks in bulk (D-48).
- Updating the rows the rule allows and leaving the others, which hides a
  refusal (D-111).
- Relation writes on many rows, until a need: moving many posts to one
  author is a `connect` per post today.

Example:

```ts
// Before: one query to list the notifications, then one update per row,
// each in its own transaction
const unread = await Notification.findMany(
	{ where: { read: false } },
	{ as: caller },
)
for (const { id } of unread) {
	await Notification.update(
		{ where: { id }, data: { read: true } },
		{ as: caller },
	)
}

// After: the update rule and hooks run on each row, all or nothing
const { count } = await Notification.updateMany(
	{ where: { read: false }, data: { read: true } },
	{ as: caller },
)

// One UPDATE: Master, no update hook, the increment computed in SQL
await Member.updateMany(
	{ where: { team: { id: teamId } }, data: { credits: { increment: 10 } } },
	{ as: master },
)

await Post.updateMany({ data: { author: { connect: { id } } } }) // type error
```

## D-134: `_count`, nested `totalCount` and sorting through relations

Amended by D-143.

Choice: completes D-20, D-46 and D-55; amends D-107 point 5 and D-129
point 5.

1. `include` and `select` take `_count`, at any level, as in Prisma:
   `_count: true` counts every `many` relation of the row, and
   `_count: { select: { posts: true } }` the ones it names, each with an
   optional `where`: `posts: { where: { published: true } }`. The row gets
   `_count: { posts: number }`, typed. A `one` relation has no `_count`.
   Create and update return it as they return an `include` (D-86).
2. `orderBy` goes through relations, as in Prisma: a `one` relation takes
   the target's `orderBy`, `{ author: { name: 'asc' } }`, chained as deep
   as `one` relations go, and a `many` relation takes `{ _count: 'asc' }`,
   with no `where`. A row whose `one` target is absent, or one the caller
   cannot read, sorts as `null`: last ascending (D-94).
3. A count holds the rows the caller reads: the target's read rule and
   ACL (D-10, D-124) apply, as in a relation filter (D-46). A caller other
   than Master cannot sort through a relation on a field with a read rule,
   as on the row's own fields (D-44).
4. The adapter runs it in the read's one round trip (D-46): a count per
   relation and per sort key, never a query per row. A cursor stays the
   row's `id`: the adapter computes the cursor row's sort keys, relations
   and counts included, so the page stays exact. The contract suite (D-94)
   covers counts and both sorts.
5. GraphQL: `totalCount` exists on every connection, nested ones
   included, and counts the rows of the connection's `where`, without its
   `first`, `last`, `after` or `before`; a nested one is the row's
   `_count`, in the same query. `PostOrderByInput` takes a `one` relation
   as its target's `OrderByInput` and a `many` relation as
   `CountOrderByInput { _count: SortOrder }`. A list with
   `pagination: 'list'` has no `totalCount`, at any level.
6. REST: a `many` relation included takes `totalCount: true` with the
   GraphQL field's other arguments; `orderBy` takes GraphQL's shape, as
   JSON. The root keeps `totalCount=true` (D-129).
7. Limits (D-55, D-107 point 6): a nested `totalCount` counts as the
   root's, `take` rows at least, times the rows of the lists above it, and
   each relation an `orderBy` goes through counts one level of `maxDepth`.

Why:

- A list of users with their post counts is today one `count` per row: N
  round trips, or a counter field kept by hooks that drifts.
- Sorting posts by their author's name, or users by their number of
  posts, is today impossible: the developer sorts in memory, which breaks
  pagination.
- A Relay client renders "12 comments" under each post; GraphQL had a
  count only at the root.
- A count that included unreadable rows would reveal them one count at a
  time, as a relation filter would (D-46).

Limit: a sort by `_count` or through a relation reads every row `where`
selects to order them, as a sort on a field without an index; `maxRows`
counts the rows returned, not those read.

Rejected:

- `_count` on a `one` relation, and a `where` in a sort by `_count`: Prisma
  has neither, and no need asks for them.
- A count in `pagination: 'list'`, whose list has nowhere to put it.
- Counting every row, readable or not, for speed.
- Aggregates (`_sum`, `_avg`, `groupBy`), until a need.

Example:

```ts
// Before: one count per user, N round trips
const users = await User.findMany({ take: 20 }, { as: caller })
const counts = await Promise.all(
	users.map(({ id }) =>
		Post.count({ where: { author: { id }, published: true } }, { as: caller }),
	),
)

// After: one query; users[0]._count.posts is a number
const counted = await User.findMany(
	{
		take: 20,
		orderBy: { posts: { _count: 'desc' } },
		include: {
			_count: { select: { posts: { where: { published: true } } } },
		},
	},
	{ as: caller },
)

// Sorted through a `one` relation
await Post.findMany({ orderBy: { author: { name: 'asc' } } }, { as: caller })
```

```graphql
users(first: 20, orderBy: { posts: { _count: desc } }) {
	edges {
		node {
			name
			posts(where: { published: true }) { totalCount }
		}
	}
}
```

```
GET /api/users?first=20&orderBy={"posts":{"_count":"desc"}}&include={"posts":{"where":{"published":true},"totalCount":true}}
```

## D-135: `OrThrow` reads, `omit`, a delete's `select` and `createMany`

Amended by D-136 and D-149.

Choice: completes D-20; amends D-102 point 2.

1. `findUniqueOrThrow` and `findFirstOrThrow` take what `findUnique` and
   `findFirst` take and return the row, never `null`: no row fails with
   the public `NOT_FOUND`, `No Post matches.`, as a write's missing row
   does (D-99). A row the caller cannot read is not found (D-72). GraphQL
   and REST keep their own answers: `null`, and 404.
2. `omit` takes scalar and system fields set to `true`, as in Prisma:
   `{ omit: { body: true } }` returns the row's scalars but `body`. Every
   query that takes `select` takes it, and so do a relation's arguments
   in `include`. With `select` it fails with `INVALID_QUERY` (D-20), and
   the types refuse it; a relation in it is an unknown key. It shapes the
   result only: the adapter reads the row as for `select`. Neither
   transport exposes it: GraphQL selects its fields, REST has `select`
   (D-129).
3. `delete` takes `select` and `include`, `_count` included, as in Prisma.
   The relations are read as they were before the delete, in its
   transaction, under the caller's read rules (D-86). A `select` of
   scalars keeps D-102's one write; a relation or a `_count` costs one
   read before the delete, for Master and for a user alike. GraphQL's
   `DeletedPost` and REST's `DELETE` keep the row without its relations
   (D-107 point 4).
4. `createMany({ data }, { as })` creates each row of `data`, one object or
   a list of them, and returns `{ count }`, as in Prisma. A row's data is
   what `create` takes, but its relation writes: `connect` on a `one`
   relation is kept, since a post needs its author and the model has no
   key field; a nested `create` and a write of a `many` relation are
   refused, as in Prisma's `createMany`.
5. Each row goes through what a `create` runs (D-67): the `create` rule on
   its data, the field rules (D-44), the defaults and validation,
   `beforeCreate`, `afterCreate` and `afterCreateCommit`. It is all or
   nothing, as `updateMany` (D-133): the rules run on every row before
   any hook, one row refused fails the call with `ACCESS_DENIED`, and a
   failed validation, a hook's error or a `UNIQUE_VIOLATION` (D-72) fails
   it too. An empty list is `{ count: 0 }` and writes nothing.
6. The rows go in one write (D-48): on PostgreSQL, one statement holds
   their `connect` checks and one multi-row `INSERT` per table. Past the
   65,535 parameters a statement binds, the write splits into several
   statements in one transaction. An `afterCreate` or `afterCreateCommit`
   hook reads each row back, one read per row, as after a `create`.
7. It is server code: neither GraphQL nor REST exposes it, as `updateMany`
   (D-133 point 7). A plugin's `queries` (D-89) have it, and the
   `OrThrow` reads.

Why:

- `findUnique` then `if (row === null) throw` is written in every
  function that reads one row; a missing row is then a different error in
  each one.
- Leaving out one field of twenty is today a `select` of nineteen, which
  must change with every new field.
- A delete that answers "what did I just remove, with its author" needs a
  `findUnique` before it, in its own transaction, which another write may
  slip between.
- Importing a hundred tags is today a hundred `create` calls: a hundred
  round trips, and a refused row leaves half of them written.

Rejected:

- `distinct`, after the first release: it is "the latest post of each
  author", which raw SQL writes meanwhile, at the cost of a subquery in
  the PostgreSQL compiler, in `memory()` and in the contract suite, and of
  its meaning under `cursor` and a connection's `totalCount`.
- `skipDuplicates`: a `beforeCreate` would run for a row the database then
  skips, and `memory()` would mimic `ON CONFLICT DO NOTHING`.
- `createManyAndReturn`, and `omit` set on the client as Prisma's global
  `omit`, which field access (D-44) already covers, until a need.
- A delete's relations in GraphQL and REST: no client case asks for them.

Example:

```ts
// Before
const post = await Post.findUnique({ where: { slug } }, { as: caller })
if (post === null) throw new PublicError('NOT_FOUND', 'No Post matches.')
await Post.findMany({
	select: { id: true, title: true, slug: true, createdAt: true /* … */ },
})
for (const name of names) await Tag.create({ data: { name } })

// After
const found = await Post.findUniqueOrThrow({ where: { slug } }, { as: caller })
await Post.findMany({ omit: { body: true }, include: { author: true } })
const { count } = await Tag.createMany({
	data: names.map((name) => ({ name })),
})

// The row as it was, with its author
const removed = await Post.delete({ where: { id }, include: { author: true } })
```

## D-136: Reads fetch the fields they return

Choice: amends D-73 and D-135 point 2.

1. A read's `Nested` takes `fields`, the system and scalar fields its rows
   return; the adapter reads `id` and those fields only, in a relation too.
   Without `fields`, it reads the whole row and each `one` key, as before.
   PostgreSQL builds its rows from those columns only; `memory()` copies
   those keys only.
2. The kernel sets `fields` from `select` and `omit` for every read it
   shapes: `findMany`, `findFirst`, `findUnique`, their `OrThrow` forms, a
   relation in `include` or `select`, and the row a write returns. An
   included relation and a `_count` are read as before, apart from the
   row's fields.
3. A field read rule (D-44) receives the whole record: its declared fields,
   `.with<{ status }>`, are types only, so the kernel cannot know which
   ones it reads. A read whose returned fields, relations or counts carry a
   read rule the caller runs therefore reads the whole row of that model.
   Master runs none (D-48), so its reads are always narrowed.
4. A write's target rows, its rules' and hooks' records, and the rows the
   kernel reads for itself keep the whole row.

Why:

- `omit: { body: true }` on posts whose body is 20 KB read 100 rows in
  ~26 ms against ~1.7 ms for the same SQL without `body`: the PostgreSQL
  server builds and sends every column, and the kernel drops one. Parse
  Server turns `keys` into a column list, the same way.

Rejected:

- Narrowing a field read rule's record to its declared fields: they exist
  in the types only, and a rule that reads an undeclared field would then
  see `undefined` and decide on it silently.
- Projection inside the adapters only, from the shape: the adapter does
  not see `select` and `omit`, and the field rules are the kernel's.

Example:

```ts
// Before and after: the same call and the same rows.
await Post.findMany({ omit: { body: true } }, { as: master })
// Before: SELECT … 'title', "t1"."title", …, 'body', "t1"."body" …
// After:  SELECT … 'title', "t1"."title", … (no body)
```

## D-137: Raw SQL on `postgres()`, and tests on the declared database

Choice: amends D-130 points 1 and 4.

1. `postgres()` returns a `Postgres`: an `Adapter` with `sql`, a tagged
   template that runs one statement and returns its rows, typed by the
   caller as `database.sql<Row>`. Each interpolated value is a parameter
   (`$1`, `$2`, ...), never SQL text; table and column names are written
   in the statement, as D-98 names them. A write returns its rows through
   `returning`, else none.
2. Inside an open transaction of the running application, `sql` runs in it,
   a hook's included: a statement that fails rolls all of it back (D-36).
   Elsewhere it runs alone. It runs no rule, hook or validation, and no
   transport exposes it. Its rows are PostgreSQL's as `pg` reads them,
   undecoded: snake_case columns, `bigint` and `numeric` as strings. Its
   errors are PostgreSQL's own. `memory()` has no `sql`.
3. `testApplication(app, { database: 'declared' })` runs the tests on the
   database the application declares instead of a new `memory()`. On
   `postgres()`, the test file gets its own schema,
   `ultimabase_test_<random>`, set as the connections' `search_path`: the
   first test creates the tables in it, each later test starts with them
   emptied by `TRUNCATE`, and the schema is dropped after the file's last
   test. No table outside that schema is read or written, whichever
   database the url names. A declared `memory()` starts empty each time; an
   adapter that can give neither is refused.
4. The kernel gives the adapter the open transaction, and `testApplication`
   the adapter's per-file schema, on `ultimabase/internal` (D-130); the
   `Adapter` contract does not change. A process killed during a test file
   leaves its schema; nothing drops another run's schemas.

Why:

- A query the API cannot express, a report or a bulk fix, needs SQL that
  still joins the transaction its hook runs in; outside it, a rollback
  would keep its changes.
- A test on `memory()` cannot check raw SQL, a PostgreSQL constraint or the
  real column types. Per test, measured on a local PostgreSQL with the
  application started and stopped each time:

  | Models | New schema per test | One schema per file, `TRUNCATE` |
  | -----: | ------------------: | ------------------------------: |
  |      1 |               26 ms |                           12 ms |
  |     10 |               67 ms |                           18 ms |
  |     50 |              247 ms |                           46 ms |

Rejected:

- An adapter given to `testApplication`: the application's `database.sql`
  would query another object.
- A new schema per test, by the measure above; a new database per file,
  which needs the `CREATEDB` right and is slower still.
- Identifier helpers, nested fragments and a separate method that returns
  a row count, until an application needs them.
- Decoding the rows: a statement's columns need not belong to one model.

Example:

```ts
// Before: no way to run SQL the API cannot express.
// After
export const database = postgres({ url: process.env.DATABASE_URL })
export const app = defineApp({ database, models: [Post] })

const top = await database.sql<{ title: string; views: number }>`
	select title, views from post where views > ${min} order by views desc`

await transaction(async () => {
	await Post.create({ data: { title: 'Hello' } }, { as: master })
	await database.sql`update post set views = views + 1 where id = ${id}`
}) // a failure rolls both back
```

```ts
// Before: tests always run on a new memory().
const running = testApplication(app)
// After: on the application's PostgreSQL, in a schema of the file's own.
const running = testApplication(app, { database: 'declared' })
```

## D-138: Nested `set`, `update`, `delete` and `connectOrCreate`

Amended by D-227.

Choice: a relation write takes Prisma's `set`, `update` and `delete` in
`update`, and `connectOrCreate` in `create` and `update` (D-20). It amends
D-20, D-86 and D-128.

1. Each nested operation is the root call it stands for, for the same
   caller. A nested `update` runs as `Target.update`: its `update` rule, its
   field rules, its validation, its update hooks and its own relation
   writes, at any depth. A nested `delete` runs as `Target.delete`: its
   `delete` rule, `beforeDelete`, the cascade (D-102) and a plugin's
   redirect (D-89). The refusal names the relation (D-82). The whole write
   stays one adapter write, depth first (D-128).
2. Only linked rows are reached. On a `many`, `update` and `delete` name
   each row by a unique target (D-52: `id`, a unique field or a unique
   index), searched among the rows linked to the parent; on a `one`, they
   reach the linked row. A row that is not linked, that the caller cannot
   read, or that a `beforeFind` hides from the operation is `NOT_FOUND`, as
   `No Comment matches data.comments.update.0.where.`
3. The spelling is Prisma's. On a `one`: `update: { ...data }`,
   `delete: true` (an optional relation only; the types and GraphQL leave it
   out of a required one, and the kernel refuses it as it refuses
   `disconnect`), `connectOrCreate: { where, create }`. On a `many`:
   `update: [{ where, data }]`, `delete: [where]`,
   `connectOrCreate: [{ where, create }]` and `set: [{ id }]`. Number
   operations (D-132) work in a nested update's data.
4. `set` is resolved before the rules: the kernel reads the linked rows the
   caller reads, and `set` becomes `connect` for the new ones and
   `disconnect` for the others. Rules and hooks see the `connect` and the
   `disconnect`, never `set`. `set` does not combine with `connect` or
   `disconnect` in the same relation, and is refused when the other side's
   key is required: `A Comment cannot be left without its post.`
5. `connectOrCreate` is resolved the same way: its `where` is a unique
   target, looked up as stored, without rules. A row found becomes a
   `connect`, which the `connect` check then holds to the caller's rules
   (D-86); none becomes a nested `create` (D-128). Two concurrent writes that
   create the same row: the second gets `UNIQUE_VIOLATION`, without a retry.
6. A relation's field rule (D-86) judges the links only. A `many` value is
   `{ connect, disconnect, create, delete }`; on a `one`, `delete: true`
   reads as `null`, as `disconnect` does. A relation write that only updates
   linked rows changes no link: the parent's field rule is not called for it.
7. A nested `delete` whose cascade reaches a row the write updates is
   refused with `INVALID_QUERY`:
   `data.post.delete deletes a row the write updates.` A stored key the
   parent itself empties does not count: on an optional stored `one`,
   `delete: true` empties the parent's key, then deletes the row.
8. A row named by two operations of one relation is refused with
   `INVALID_QUERY`, two updates of it included. A `disconnect` and a
   `connect` of the same id stay allowed, as D-101 decided.
9. A nested update's data leaves out the relation back to the parent, as a
   nested create's does (D-128): `CommentUpdateWithoutPostInput` has no
   `post`, and the kernel refuses it.
10. Within a relation, the deletes run first, then the creates, the
    disconnects and the connects, then the updates; relations in the order
    the data gives them.
11. GraphQL names the inputs as Prisma does:
    `CommentUpdateManyWithoutPostNestedInput` takes `connect`,
    `connectOrCreate`, `create`, `delete`, `disconnect`, `set` and
    `update`; `CommentUpdateWithWhereUniqueWithoutPostInput` is
    `{ where: CommentWhereUniqueInput!, data }`;
    `CommentCreateOrConnectWithoutPostInput` is `{ where, create }`;
    `ProfileUpdateOneWithoutUserNestedInput` is `@oneOf` and adds `update`
    and `delete: Boolean`. A hidden model (`graphql: false`) gets no
    `update`, `delete` or `connectOrCreate` through a relation, as it gets
    no `create`; `connect`, `disconnect` and `set` stay. REST takes the same
    JSON, its dates read in each nested data.

Why:

- Four calls, atomic only inside `transaction()`, become one write. Each
  operation runs the rules and hooks of the call it stands for, so nesting
  opens no way around a rule (D-128).
- Resolving `set` and `connectOrCreate` first lets the rules and the hooks
  see plain links, which they already judge; a field rule written for
  `connect` and `disconnect` keeps holding.
- Reaching only linked rows makes `Post.update` act on that post's
  comments, as Prisma does; another post's comment is `NOT_FOUND`, never
  changed through the wrong parent.
- A link judged by its field rule, and an update judged by the target's
  `update` rule: an update of a comment through its post is still checked,
  by the comment's rule.

Rejected:

- `set` and `connectOrCreate` given to rules and hooks as written: every
  field rule would have to understand them.
- `connectOrCreate` looked up through the caller's read rule: an unreadable
  row would be created again, and its unique value would fail anyway.
- `update` and `delete` on any row of the target, linked or not.
- A field rule called for a nested `update`: it judges links, and no link
  changes.

Later (D-20): nested `upsert`, `createMany`, `updateMany` and `deleteMany`;
`connect` by a unique target other than `id`.

Example:

```ts
// Before: four calls, atomic only inside transaction()
await Comment.update({ where: { id: c1 }, data: { body: 'edited' } }, M)
await Comment.delete({ where: { id: c2 } }, M)
const tag =
	(await Tag.findUnique({ where: { name: 'news' } }, M)) ??
	(await Tag.create({ data: { name: 'news' } }, M))
await Post.update(
	{ where: { id }, data: { tags: { connect: [{ id: tag.id }] } } },
	M,
)

// After: one write
await Post.update(
	{
		where: { id },
		data: {
			comments: {
				update: [{ where: { id: c1 }, data: { body: 'edited' } }],
				delete: [{ id: c2 }],
			},
			tags: {
				connectOrCreate: [
					{ where: { name: 'news' }, create: { name: 'news' } },
				],
			},
		},
	},
	M,
)
await Post.update({ where: { id }, data: { tags: { set: [{ id: t1 }] } } }, M)
await User.update(
	{ where: { id }, data: { profile: { update: { bio: 'Hi' } } } },
	M,
)
await User.update({ where: { id }, data: { profile: { delete: true } } }, M)
```

## D-139: One transport core, and the kernel's value checks shared

Choice: extends D-130's `ultimabase/internal`, and gives `@ultimabase/http`
one of its own.

1. `@ultimabase/http/internal`, a subpath only official transports import,
   holds what REST and GraphQL share (D-129): a kernel query run with its
   refusal sent as `BAD_USER_INPUT` (D-106), the pages of D-55 (Relay and
   `take`/`skip` arguments, cursors, limits and connections), the rows of
   a relation, a model's plural and readable fields (D-44), and a schema's
   standard JSON Schema export (D-45). Like `ultimabase/internal`, it is
   not documented and may change with any version.
2. Page arguments are read as REST reads them: an argument of another type
   is refused, naming where it was written. GraphQL's types refuse such a
   value before, so its responses do not change.
3. `ultimabase/internal` gives `isRow` and `issueOf`, the kernel's check of
   a scalar value and its message, lists included (D-127, D-132). postgres,
   the transports and password use them instead of their own copies.
4. password's input checks are the kernel's: a date may still come as an
   ISO string, and an optional field still takes `null`, but the messages
   are the kernel's, and a date of year 10000 or a string holding a NUL is
   refused by the input instead of by the write that follows.

Why:

- REST and GraphQL held about 250 identical lines: pages, errors, names and
  JSON Schema reading. A fix had to be made twice, and D-129's parity
  depended on it.
- password checked values with rules of its own, looser than the kernel's,
  so a sign-up could pass its input and fail on its write with another
  message and path.

Rejected:

- A new `@ultimabase/transport` package: one more package to version and
  publish for code that only the two transports read, which both already
  require `@ultimabase/http`.
- The transport core on `ultimabase/internal`: the kernel would hold
  cursors and Relay connections, which only HTTP transports use.
- GraphQL's lenient page readers: they relied on GraphQL's types, which
  REST does not have.

Example:

```ts
// Before: packages/rest/src/pages.ts and packages/graphql/src/pages.ts, the
// same pagination twice, and two copies of run, badInput, plural, readable,
// isRow and the JSON Schema reader.
// After: one copy, in @ultimabase/http.
import { connection, pageOf, run } from '@ultimabase/http/internal'
import { isRow, issueOf } from 'ultimabase/internal'
```

```ts
// A sign-up with an age of NaN and a date of year 10000.
// Before
;[
	{ path: ['input', 'age'], message: 'Expected a number.' },
	// born passed the input, its write refused it
]
// After
;[
	{ path: ['input', 'age'], message: 'Expected a finite number.' },
	{ path: ['input', 'born'], message: 'Expected a Date of years 1 to 9999.' },
]
```

## D-140: Case-insensitive string filters

Amended by D-170.

Choice: amends D-20, which left them to a search plugin.

1. A filter on a `string` field takes `mode: 'insensitive'`, as in Prisma:
   its `equals`, `not`, `in`, `notIn`, `contains`, `startsWith` and
   `endsWith` then ignore case. The shorthand (`email: 'Ana'`) keeps case.
   `mode` takes `'insensitive'` only: Prisma's `'default'` is a filter
   without `mode`, which `undefined` already gives (D-84). An id, an enum and
   a list of strings take no `mode`.
2. The normalized condition carries `mode: 'insensitive'` (D-73).
   PostgreSQL compiles each of its operators to `ilike`, an equality to an
   `ilike` without wildcards, so that one trigram index serves them all
   (D-141). `memory()` compares both sides' `toLowerCase()`.
3. A string column sorts under `collate "C"`, which folds ASCII only, so
   the `ilike` reads it under the database's collation
   (`collate "default"`). Under the `C` locale that one also folds ASCII
   only, and `É` would match `é` in `memory()` but not there.
   `postgres()` checks `lower('É') = 'é'` when it starts and, when it does
   not hold, warns once through the kernel's logger, which an adapter's
   `start` now receives.
4. REST reads `mode` in its `where` as the kernel does (D-129). GraphQL's
   `StringFilter` takes `mode: QueryMode`, an enum whose one value is
   `insensitive`.

Why: a sign-in by email, a tag or a name typed by a user is matched without
case in most applications, and Prisma's developers expect `mode`. Without
it, the application stores a lowered copy of each such field. `ilike` lowers
both sides as `lower()` does, so equality keeps its meaning.

Rejected:

- `lower(column) = lower(value)` for an equality: no trigram index serves
  it, and a `lower()` index would be a second index kind.
- An ICU collation written into the SQL (`collate "und-x-icu"`): not every
  host builds PostgreSQL with ICU.
- Refusing to start under `C`: the database works, only letters beyond
  ASCII differ.
- A `citext` column, or `f.string({ caseInsensitive: true })`: every query
  on the field would ignore case, and uniqueness with it; that is a property
  of the stored value, which a `beforeCreate` normalizing it already gives.

Example:

```ts
// Before: a lowered copy of the email, kept by a hook
const user = await User.findFirst({
	where: { emailLower: input.email.toLowerCase() },
})
// After
const user = await User.findFirst({
	where: { email: { equals: input.email, mode: 'insensitive' } },
})
```

```graphql
{
	users(where: { name: { contains: "ada", mode: insensitive } }) {
		edges {
			node {
				name
			}
		}
	}
}
```

```text
WARN  PostgreSQL folds case under its C locale for ASCII only: a case-insensitive
      filter matches É and é in memory() but not here. Create the database with
      a UTF-8 locale, such as en_US.UTF-8.
```

## D-141: Trigram indexes for substring and case-insensitive filters

Choice: amends D-52.

1. An index of `defineModel` takes `contains: true` over one `string` field
   that is not a list, and not with `unique`:
   `indexes: [{ fields: ['title'], contains: true }]`. A plugin's index
   takes it too (D-122). Anything else is refused on the index's line. It
   speeds up `contains` and `endsWith` in both modes, and every operator
   of D-140's `mode: 'insensitive'`. It changes no result; `memory()`
   ignores it.
2. `postgres()` makes it a GIN index of `pg_trgm` over the column read
   under the database's collation, named `<table>_<column>_trgm`, so a
   field can also have a plain index:
   `create index "book_title_trgm" on "book" using gin (("title" collate "default") gin_trgm_ops)`.
   The snapshot keeps it apart from plain indexes, as `trigrams` (D-105).
3. `contains` and `endsWith` read the column under `collate "default"`
   whatever the mode, as D-140's operators already do, so one index
   serves both modes. The default collation is deterministic, so `like`
   matches the same characters as under `"C"`. An equality, `in`, a
   comparison and a case-sensitive `startsWith` keep the bare column,
   which a plain index serves: under `"C"` it serves a prefix.
4. A plan that adds a trigram index runs
   `create extension if not exists pg_trgm` first, which installs it in
   the first schema of the `search_path`: `public` by default. No plan
   drops the extension, which other objects may use. The operator class resolves through the
   `search_path`, so a schema that holds the extension must be on it, as
   Supabase's `extensions` is.
5. A D-137 test schema whose models declare a trigram index: before it
   connects, `postgres()` installs the extension with the url's own
   `search_path`, as a migration would, then puts the extension's schema
   after the test schema in the connections' `search_path`. Dropping the
   test schema leaves the extension.

Why: `contains` reads every row without an index, and so does each
case-insensitive filter, `email` equality included. A trigram index is the
one PostgreSQL index that serves `like` and `ilike` anywhere in the string.
Naming the index by what it serves keeps the model free of PostgreSQL's
vocabulary. `pg_trgm` ships with PostgreSQL and is trusted since version 13,
so a database owner installs it without being a superuser.

Rejected:

- `type: 'gin'` with an operator class, as Prisma writes it: PostgreSQL's
  words in the model, and a choice no other index kind needs yet.
- Reading every text operator under `collate "default"`: a plain index on
  the `"C"` column then no longer serves a case-sensitive `startsWith`.
- An index on `lower(title)`: it serves `ilike` only, and needs a second
  index for the case-sensitive `contains`.
- An index on the bare column: it does not serve the `collate "default"`
  `ilike` that D-140 needs beyond ASCII (measured on PostgreSQL 15 and 18).
- Installing the extension in the test schema: it is database-wide, other
  test files would not see it, and dropping the schema would drop their
  indexes with it.

Example:

```ts
// Before: every contains reads the whole table
export const Book = defineModel('Book', {
	fields: { title: f.string() },
})
// After
export const Book = defineModel('Book', {
	fields: { title: f.string() },
	indexes: [{ fields: ['title'], contains: true }],
})
await Book.findMany(
	{ where: { title: { contains: 'engine', mode: 'insensitive' } } },
	as,
)
```

```sql
-- The migration `ultimabase migrate create` writes
create extension if not exists pg_trgm;
create index "book_title_trgm" on "book" using gin (("title" collate "default") gin_trgm_ops);
```

## D-142: `upsert`

Amended by D-227.

Choice: amends D-20 and D-129.

1. `Model.upsert({ where, create, update, select | include | omit }, as)`
   takes a unique target (D-52), the data of a create and the data of an
   update, as Prisma does, and returns the row as a create or an update
   returns it (D-86). `create` is written as given: `where` is not merged
   into it. Both data are checked, whichever runs.
2. It reads the target locked, as an update does (D-99). A row the caller
   cannot read, or that `beforeFind` hides from an update (D-124), is
   absent.
3. The branch that runs is a plain `create` or `update`, with its own
   rules and hooks: when the row is absent, the create rule on the data,
   defaults, validation, `beforeCreate`, `afterCreate` and
   `afterCreateCommit`; when it is there, the update rule on the record,
   `beforeUpdate`, `afterUpdate` and `afterUpdateCommit`. Nothing runs for
   the branch that does not.
4. Two upserts that both find no row both create: the second fails with
   `UNIQUE_VIOLATION`, as two creates do. No adapter change, no
   `on conflict`. An absent row that a rule hides fails the same way.
5. GraphQL: `upsertTag(where: TagWhereUniqueInput!, create: TagCreateInput!, update: TagUpdateInput!): Tag!`.
6. REST: `PUT /api/tags` with the body `{ where, create, update }`, and
   `select` or `include` in the query. It answers `201 Created` when it
   created the row, `200 OK` when it updated it. The kernel tells the
   transports which branch ran; the model's `upsert` returns the row only.

Why: "create it unless it exists" is a find then a write in every
application, written in a transaction or racing. Running the branch's own
rules and hooks keeps each write's guarantees: a hook that fills
`createdBy` runs on every row created, and an update rule guards every row
changed, however the write was asked for.

Rejected:

- Merging `where` into `create`: Prisma does not, and a composite target
  then has two places to say one value.
- `insert … on conflict do update`: it runs an update without reading the
  row, so neither the update rule on the record nor `beforeUpdate` can run.
- Retrying the update after a `UNIQUE_VIOLATION`: it hides a conflict the
  caller may not have the right to see, and runs the create's hooks for a
  row never kept.
- An upsert's own rule or hook: a third write to guard, which every rule
  already written would miss.
- `POST /api/tags?upsert=true`: a create that sometimes updates; `PUT` on
  the collection says "this row, as I describe it".

Example:

```ts
// Before: a read, then a write, in a transaction
const tag = await transaction(async () => {
	const found = await Tag.findUnique({ where: { slug: 'news' } }, as)
	return found === null
		? Tag.create({ data: { slug: 'news', uses: 1 } }, as)
		: Tag.update(
				{ where: { slug: 'news' }, data: { uses: found.uses + 1 } },
				as,
			)
})
// After
const tag = await Tag.upsert(
	{
		where: { slug: 'news' },
		create: { slug: 'news', uses: 1 },
		update: { uses: { increment: 1 } },
	},
	as,
)
```

```graphql
mutation {
	upsertTag(
		where: { slug: "news" }
		create: { slug: "news", uses: 1 }
		update: { uses: 2 }
	) {
		id
		uses
	}
}
```

```http
PUT /api/tags?select={"id":true,"uses":true}
{ "where": { "slug": "news" }, "create": { "slug": "news", "uses": 1 }, "update": { "uses": 2 } }
→ 201 { "id": "…", "uses": 1 }
```

## D-143: `aggregate`

Choice: completes D-20 and D-44; amends D-134's rejection of aggregates.

1. `Model.aggregate({ where, _count, _sum, _avg, _min, _max }, as)`
   aggregates the rows `where` selects, as Prisma's `aggregate` does, and
   returns an object holding the keys it asked for:
   - `_count: true` counts the rows; `_count: { _all: true, title: true }`
     counts them and each field's non-null values;
   - `_sum` and `_avg` take number fields;
   - `_min` and `_max` take number, string and date fields, `createdAt` and
     `updatedAt` included; strings compare by code point, as a sort does
     (D-94).
     A field is a scalar of the model, neither a list, a `json` nor a plugin
     field type's (D-122). Without rows, `_count` is 0 and the others are
     `null`. The result's type follows the arguments, as a `select` does.
2. It aggregates the rows the caller reads: the read rule and `beforeFind`
   apply, as for `count` (D-124).
3. A field with a read rule is refused to a caller other than Master, in
   any aggregate, `_count` included: `INVALID_QUERY`, as a filter or a sort
   on it (D-44).
4. No `orderBy`, `take`, `skip` or `cursor`: an aggregate of a page has no
   need yet.
5. Server code only: neither REST nor GraphQL expose it. An application
   exposes an aggregate through a function (D-14), which says what its
   callers may learn.
6. The adapter contract gains `aggregate({ model, where, aggregates })`,
   each aggregate `{ operation, field? }`, which returns one value per
   aggregate, in order. PostgreSQL returns a sum and an average as
   `float8`: a sum of non-whole numbers may differ from memory's in its
   last digits, as their order of addition does.

Why: a dashboard total, an average rating or the date of the last order is
one round trip on the database, not every row read into the server.
Exposing it on the transports would let any caller compute a sum of rows
it reads one by one but should not total, and the transports' parity
(D-129) would make that two surfaces to secure; a function is one.

Rejected:

- Aggregates on the transports: see Why.
- `_count` on relations, lists and `json`: no need asks for them.
- Aggregating every row, readable or not: it reveals the rows a read rule
  hides, as a count would (D-134).
- Summing in the server from `findMany`: every row crosses the wire.

Example:

```ts
// Before: every row read to compute three numbers
const orders = await Order.findMany(
	{ where: { paid: true }, select: { total: true, createdAt: true } },
	as,
)
const sum = orders.reduce((s, order) => s + order.total, 0)
const average = orders.length === 0 ? null : sum / orders.length
const last = orders.reduce<Date | null>(
	(max, { createdAt }) => (max === null || createdAt > max ? createdAt : max),
	null,
)
// After: one query
const stats = await Order.aggregate(
	{
		where: { paid: true },
		_count: true,
		_sum: { total: true },
		_avg: { total: true },
		_max: { createdAt: true },
	},
	as,
)
// { _count: 3, _sum: { total: 120 }, _avg: { total: 40 }, _max: { createdAt: Date } }
```

## D-144: An OpenAPI document

Choice: completes D-129 and D-125's point 8.

1. `rest` serves an OpenAPI 3.1 document at `GET {path}/openapi.json`,
   `/api/openapi.json` by default, always, as GraphQL answers its
   introspection. It is built once at startup and needs no caller.
2. One document, as a caller other than Master sees the API, as the GraphQL
   schema is: the models REST exposes, the readable fields, the page limits
   (`maxTake`) and the functions. `info` gives `UltimaBase REST API` and the
   version of `@ultimabase/rest`; `servers` gives the base path, so the paths
   read `/posts`, `/posts/{id}`, `/functions/{name}`.
3. Its schemas carry GraphQL's type names (D-129): `Post`, `PostWhereInput`,
   `StringFilter`, `PostOrderByInput`, `PostWhereUniqueInput`,
   `PostCreateInput`, `PostUpdateInput`, `PostConnection`, `PageInfo`, a
   function's `…Input` and `…Output`. REST's own parameters add `PostSelect`
   and `PostInclude`.
4. `where` is typed per model, its filters and relation filters included;
   `where`, `orderBy`, `select` and `include` are JSON parameters
   (`content: application/json`), as REST reads them; a page's numbers and
   cursors are plain parameters. A `@oneOf` input takes exactly one key;
   inputs refuse unknown keys. `PostWhereUniqueInput` is REST's flat form,
   one variant per unique set (`{ id }`, `{ author, slug }`).
   Each route has an `operationId`, `posts`, `post`, `createPost`,
   `upsertPost`, `updatePost`, `deletePost` and a function's name, and its
   model's tag or `functions`; two routes of one id stop the startup.
5. A row lists the fields of the default shape as required, and its
   relations as optional, since `include` adds them. `select` returns only
   the fields it names, which its parameter says.
6. A JSON field's schema is its validator's JSON Schema (D-125), on the
   input side for a write and the output side for a row. The `$defs` it
   exports become schemas named by their ids, `Input`-suffixed on the input
   side, as GraphQL names them; two shapes under one name stop the startup.
7. Every error answer is the `Error` schema: `code`, `message`, `details`,
   `correlationId`.
8. No security scheme: `rest` does not know who authenticates (D-129).
9. No dependency in production. The tests check the document with
   `@seriousme/openapi-schema-validator` and REST's real answers against it
   with `ajv`, both development dependencies.
10. Later: an interactive `/docs` page, in a plugin of its own.

Why: a client generator, an API tester or a gateway reads an OpenAPI
document, as GraphQL tools read the introspection; without one, every REST
client types the API by hand. Built from the same JSON Schema as GraphQL,
it cannot drift from the routes. Seen as a caller other than Master, it
shows what any caller may learn, and nothing a rule hides.

Rejected:

- A document per caller: it would differ from GraphQL's single schema, and
  a cache could not share it.
- An option to turn it off: the GraphQL introspection has none; hiding a
  model is the model's choice (D-129).
- YAML: JSON needs no dependency, and every tool reads it.
- Untyped `where` (`{ type: 'object' }`): a generated client would lose the
  filters, which are most of the API.
- A production dependency to build the document: it is the JSON Schema the
  validators give, put together.
- A security scheme from `auth`: a plugin writing into another's document
  needs a hook no other need asks for yet.

Dependencies (D-92): `@seriousme/openapi-schema-validator` checks a document
against the OpenAPI 3.1 meta-schema, which is hundreds of lines of JSON
Schema we would otherwise copy; `ajv` validates the answers against the
documented schemas, which no Node API does. Both run in tests only.

Example:

```ts
// Before: a REST client types its calls by hand
type Post = { id: string; title: string; status: 'draft' | 'published' }
const res = await fetch('/api/posts?where={"status":"published"}')
const posts: Post[] = await res.json()
// After: the types come from the document
// npx openapi-typescript http://localhost:3000/api/openapi.json -o api.d.ts
import createClient from 'openapi-fetch'
import type { paths } from './api.d.ts'
const api = createClient<paths>({
	baseUrl: '/api',
	// REST reads a JSON parameter, not openapi-fetch's `where[status]=…`
	querySerializer: (query) =>
		new URLSearchParams(
			Object.entries(query)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => [
					key,
					typeof value === 'string' ? value : JSON.stringify(value),
				]),
		).toString(),
})
const { data } = await api.GET('/posts', {
	params: { query: { where: { status: { equals: 'published' } } } },
})
```

## D-145: A decimal field type

Choice: completes D-12 and D-132; amends D-143's aggregate types.

1. `f.decimal({ precision, scale })` holds exact decimal numbers of at
   most `precision` digits, `scale` of them after the point, as SQL's
   `numeric(precision, scale)`. Both are required: `precision` is a whole
   number from 1 to 1000, `scale` from 0 to `precision`. A decimal takes
   `optional`, `unique`, `default`, `validate` and the rules as `date`
   does, and no `list`.
2. A value is a string, read and written: `'12.50'`. A write takes digits
   with an optional `-` and an optional fraction, `/^-?\d+(\.\d+)?$/`; a
   JavaScript number is refused, since `0.1 + 0.2` is not `0.3`. The
   kernel stores it normalized to the scale: `'012.5'` is `'12.50'`, `'-0'`
   is `'0.00'`, `'7.500'` is `'7.50'`. A value with more significant
   decimals than the scale, or more digits before the point than
   `precision - scale`, does not fit and is refused, never rounded.
3. A filter takes `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt` and
   `gte`, its operands checked and normalized as values; `orderBy` sorts by
   value. `memory()` compares exactly, through `BigInt`, as PostgreSQL.
   A decimal has no `increment`, as no need asks for it yet (D-132).
4. In `aggregate` (D-143), `_sum`, `_min` and `_max` take decimal fields
   and return decimal strings: `_sum` is exact, at the field's scale, and
   may hold more digits than `precision`. `_avg` returns a JavaScript
   number, as for a number field: an exact average has no finite form.
5. PostgreSQL stores it as `numeric(precision, scale)` and returns its
   text. A migration converts a changed precision or scale with a cast: a
   lower scale rounds the stored values, as PostgreSQL does, and a value
   too large for the new precision fails the migration.
6. GraphQL types it `Decimal`, a scalar that takes and returns a string,
   with a `DecimalFilter`; REST and the OpenAPI document type it as a
   string of that pattern (D-129, D-144). A plugin field type may store
   its values in a decimal, `precision` and `scale` given (D-122).

Why: money and quantities need exact arithmetic, which a float
(`f.number()`) does not give. A string keeps every digit across JSON, the
`pg` driver, GraphQL and REST, with no dependency: an application that
computes on decimals picks its own library, as Prisma's users do with
`Decimal.js`. Refusing a value the scale cannot hold says so to the caller
rather than storing a different amount.

Rejected:

- A `Decimal` class in the kernel, or a dependency's: every caller and
  plugin would take it, and JSON cannot carry it (D-92).
- Accepting numbers: `12.1` as a double is `12.0999…`, and a caller would
  believe it exact.
- Rounding to the scale, as PostgreSQL does: the stored amount would
  differ from the one written, silently.
- A default precision and scale: the right ones depend on the amounts,
  and PostgreSQL's unconstrained `numeric` has no scale to normalize to.
- Lists of decimals: no need asks for them (D-127).

Example:

```ts
// Before: cents in an integer, converted at every edge
const Order = defineModel({
	name: 'Order',
	fields: (f) => ({ totalCents: f.number({ integer: true }) }),
})
await Order.create({ data: { totalCents: Math.round(12.5 * 100) } }, as)
const order = await Order.findUniqueOrThrow({ where: { id } }, as)
const shown = (order.totalCents / 100).toFixed(2)
// After: the amount as written
const Order = defineModel({
	name: 'Order',
	fields: (f) => ({ total: f.decimal({ precision: 10, scale: 2 }) }),
})
await Order.create({ data: { total: '12.5' } }, as)
const order = await Order.findUniqueOrThrow({ where: { id } }, as)
order.total // '12.50'
await Order.aggregate({ _sum: { total: true } }, as) // { _sum: { total: '1250.40' } }
```

## D-146: `groupBy`

Amended by D-149.

Choice: completes D-20 and D-143.

1. `Model.groupBy({ by, where, _count, _sum, _avg, _min, _max, orderBy,
skip, take }, as)` groups the rows `where` selects, as Prisma's
   `groupBy` does, and returns one object per group: its `by` values, then
   the aggregates it asked for, which take what `aggregate` takes (D-143).
   - `by` is a non-empty list of distinct fields: a scalar an aggregate
     takes (neither a list, a `json` nor a plugin field type's, D-122),
     `id`, `createdAt`, `updatedAt`, or a `one` relation the row stores
     (D-37), grouped by its target's id.
   - A relation's value is `{ id }`, or `null` when unset or when its target
     is a row the caller cannot read, which is absent everywhere (D-86).
   - The rows with no value in a field form one group, as SQL's
     `GROUP BY` makes them.
2. `orderBy` is an object or a list of objects. Each key is a field of
   `by`, `_count: 'asc' | 'desc'` for the group's rows, or
   `_count | _sum | _avg | _min | _max: { field: 'asc' | 'desc' }`, an
   aggregate the result need not ask for. The groups are then sorted by the
   other fields of `by`, ascending, so the order is total and a page exact.
   `null` sorts last ascending and first descending, as a read's sort
   (D-94).
3. `skip` and `take` are integers of at least 0. No cursor: a group has no
   id. No `having`: `where` filters the rows before they are grouped, and
   code filters the groups.
4. It groups the rows the caller reads: the read rule and `beforeFind`
   apply, as for `aggregate`. A field with a read rule is refused to a
   caller other than Master in `by`, in an aggregate and in `orderBy`:
   `INVALID_QUERY` (D-44).
5. Server code only, as `aggregate` (D-143).
6. The result's type follows the arguments: each `by` field with its
   stored value, a relation as `{ id } | null`, the aggregates as
   `aggregate` types them.
7. The adapter contract's `aggregate` gains:
   - `by`, the group keys: a field, or the `id` of the row `through`
     reaches, as a sort key does (D-134);
   - `orderBy`, each `{ at, direction }`, where `at` counts the keys, then
     the aggregates;
   - `skip` and `take`.

   It returns one list per group: the values of its keys, then of its
   aggregates. Without `by`, one list, even without rows; with `by`, no row
   gives no group. The kernel adds the aggregates an `orderBy` needs and
   leaves them out of the result; `Model.aggregate` calls it without `by`.

Why: posts per author, sales per region or the ten busiest days are one
statement on the database, not every row read into the server and counted
there. Sorting by position keeps the adapter small: it groups, sorts and
pages lists of values, and the kernel names them.

Rejected:

- `having`: no need asks for it yet; a sort by an aggregate and `take`
  give the top groups.
- Prisma's rule that `skip` and `take` need an `orderBy`: the order is
  always total here, so a page is exact without one.
- Grouping by a related row's field (`author.country`): no need asks for
  it.
- A separate adapter method: a group of every row is the aggregate
  already there.
- `groupBy` on the transports: see D-143.

Example:

```ts
// Before: every post read to count them by author
const posts = await Post.findMany(
	{ select: { author: { select: { id: true } } } },
	as,
)
const counts = new Map<string | null, number>()
for (const { author } of posts) {
	const id = author?.id ?? null
	counts.set(id, (counts.get(id) ?? 0) + 1)
}
const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10)
// After: one query
const top = await Post.groupBy(
	{ by: ['author'], _count: true, orderBy: { _count: 'desc' }, take: 10 },
	as,
)
// [{ author: { id: 'u1' }, _count: 12 }, { author: null, _count: 3 }, …]
```

## D-147: `distinct`

Choice: completes D-20 and D-146.

1. `Model.findMany({ distinct, ... }, as)` keeps, of the rows with the same
   values in the `distinct` fields, the first in `orderBy` order, as
   Prisma's `distinct` does. `skip` and `take` then page the rows kept; a
   negative `take` gives the last ones.
   - `distinct` is a non-empty list of distinct fields, the ones `groupBy`
     takes in `by` (D-146): a scalar an aggregate takes, a system field or
     a `one` relation the row stores.
   - The order always ends with `id` (D-94), so the row kept is exact.
   - A relation compares by its target as the caller sees it: a target the
     caller cannot read counts as none (D-86), as in `groupBy`.
2. Refused with a `cursor`: `INVALID_QUERY`. The cursor's row may be one
   `distinct` drops, and a page of the rows kept has no row to start at.
3. On the root of `findMany` only: not on `findFirst`, whose first row is
   already distinct, nor on an included `many`, `count` or `aggregate`.
4. The read rule and `beforeFind` select the rows before `distinct` keeps
   one of each. A field with a read rule is refused in `distinct` to a
   caller other than Master: `INVALID_QUERY` (D-44).
5. Server code only, as `aggregate` (D-143): REST and GraphQL do not take
   it.
6. The result's type is `findMany`'s: `distinct` changes which rows come
   back, not their shape.
7. The adapter contract's root read gains `distinct`, the keys of
   `groupBy` (D-146). The adapter keeps the first row of each key in the
   read's order, before `skip` and `take`; PostgreSQL numbers the rows of
   each key with `row_number()` over that order.

Why: the latest post of each author or one row per city is one statement
on the database, not every row read into the server and filtered there.

Rejected:

- PostgreSQL's `DISTINCT ON` as the contract: it needs the order to start
  with the keys, so the caller's `orderBy` would change the row kept.
- A field name alone, `distinct: 'author'`: one form, as `by`.
- `distinct` with a cursor, for the reason above.
- `distinct` on the transports: see D-143.

Example:

```ts
// Before: every post read, the latest of each author kept in code
const posts = await Post.findMany({ orderBy: { createdAt: 'desc' } }, as)
const latest = new Map<string | null, (typeof posts)[number]>()
for (const post of posts) {
	const id = post.author?.id ?? null
	if (!latest.has(id)) latest.set(id, post)
}
// After: one query
const latest = await Post.findMany(
	{ distinct: ['author'], orderBy: { createdAt: 'desc' }, take: 20 },
	as,
)
```

## D-148: Full-text search

Choice: completes D-20, D-94 and D-141.

1. A `string` field that is not a list takes `search: true`:
   `f.string({ search: true })`; no other builder takes it, and a list
   refuses it as it refuses `unique`. A model's searched fields form one
   document, in declaration order. A searched field with a read rule
   (D-44) is refused when the app starts: a match would reveal a value
   the caller cannot read. `_search` and `_relevance` join the names the
   kernel owns, which no field takes.
2. `where: { _search: 'text' }` keeps the rows whose document matches
   `text`, written as a search box takes it, PostgreSQL's
   `websearch_to_tsquery`: words all present, `"a phrase"`, `-word`
   absent, `or` between alternatives. It is a filter as any other: in
   `AND`, `OR`, `NOT`, in a relation's filter, in `count`, `aggregate`,
   `groupBy`, `updateMany` and `deleteMany`, not in a unique `where`. A
   text with no word matches no row, as PostgreSQL does; an application
   leaves `_search` out, `undefined`, for an empty box (D-84). On a model
   without searched fields, `_search` is an unknown key: `INVALID_QUERY`.
3. `orderBy: { _relevance: 'desc' }` sorts by how well each row matches
   the `_search` of the same read's `where`, its top level: PostgreSQL's
   `ts_rank`. Without that `_search` it is refused: `INVALID_QUERY`. It
   takes a place in the order as a field does, and the rest of the order,
   then `id`, breaks its ties (D-94). It is a read's sort: on `findMany`,
   `findFirst` and an included `many`, with `cursor` and `distinct`; not
   through a relation, and not in `groupBy`'s `orderBy`. The score is not
   returned.
4. `postgres({ searchLanguage })` names the text search configuration of
   every model, `'simple'` by default, which lowercases and stems nothing;
   `'french'` or `'english'` stem and drop stop words. `postgres()` checks
   at start that the database has it. A multilingual application with one
   language per row, and weights per field (`search: { weight }`), wait
   for a need.
5. `postgres()` stores the document in a generated column, `_search`, with
   a GIN index, `<table>__search_idx`:

   ```sql
   alter table "post" add column "_search" tsvector generated always as (to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("body", ''))) stored;
   create index "post__search_idx" on "post" using gin ("_search");
   ```

   The snapshot keeps it apart from columns and indexes, as `search`, with
   its language and columns (D-105). A changed language or set of fields
   drops and adds the column, which loses nothing: the database computes
   it again. Adding it rewrites the table, as any stored column does.

6. `memory()` approximates PostgreSQL's `'simple'` configuration whatever
   the language: the words of the document and of the text are their runs
   of letters and digits, lowercased; a phrase matches consecutive words;
   the relevance follows `ts_rank`'s formula. The contract suite searches
   under `'simple'` with plain words, where both agree.
7. The adapter contract gains:
   - `search: true` on a searched scalar field of the schema;
   - a `Condition` `{ search: text }` under the `Filter` key `_search`;
   - on an `Order`, `relevance: text` with `field: '_relevance'`.
8. REST and GraphQL take `_search` and `_relevance` where the kernel does,
   with the same names (D-129): GraphQL's `PostWhereInput` gains
   `_search: String`, `PostOrderByInput` `_relevance: SortOrder` on a
   model with searched fields; OpenAPI documents both. A relation's
   `orderBy` shares its target's input type, so GraphQL shows
   `_relevance` there too, which the kernel refuses.

Why: a search box over titles and bodies is in most applications, and
`contains` neither ranks, nor matches words in any order, nor serves an
index across fields. One document per model is one column and one index,
and one `_search` reads like the box the user typed in. PostgreSQL's
websearch syntax never fails on what a user types.

Rejected:

- The fields listed on the model, `search: { fields: ['title', 'body'] }`:
  a field's options belong on the field, and the list would repeat names.
- Prisma's `search` operator on a field, `title: { search: 'cat & dog' }`:
  it takes `to_tsquery`'s syntax, which fails on ordinary input, and needs
  a document per field.
- The language on each model: one setting per database serves most
  applications; changing it is one migration.
- Returning the score, or a highlighted excerpt (`ts_headline`): no need
  asks for them yet.
- Stemming in `memory()`: one dictionary per language to embed, for a
  development adapter.

Example:

```ts
// Before: every word a `contains`, no order by relevance, no index
const words = input.split(/\s+/).filter(Boolean)
const posts = await Post.findMany(
	{
		where: {
			AND: words.map((word) => ({
				OR: [
					{ title: { contains: word, mode: 'insensitive' } },
					{ body: { contains: word, mode: 'insensitive' } },
				],
			})),
		},
	},
	as,
)
// After
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string({ search: true }),
		body: f.string({ search: true }),
	}),
})
const posts = await Post.findMany(
	{
		where: { _search: input || undefined },
		orderBy: { _relevance: 'desc' },
		take: 20,
	},
	as,
)
```

```graphql
{
	posts(where: { _search: "chat -noir" }, orderBy: { _relevance: desc }) {
		edges {
			node {
				title
			}
		}
	}
}
```

## D-149: `having`, rows from bulk writes, `nulls`, list updates and JSON paths

Amended by D-228.

Choice: completes D-20; amends D-120 point 2, D-125, D-133, D-135 and
D-146 point 3.

1. `groupBy` takes `having`, in Prisma's shape: a filter of the groups,
   with `AND`, `OR` and `NOT`, keyed by field.
   - Under a field of `by`, that field's filter (D-20) tests the group's
     value. A field outside `by` with its own filter fails with
     `INVALID_QUERY`, as in Prisma.
   - Under a field an aggregate takes (D-143), `_count`, `_sum`, `_avg`,
     `_min` or `_max` holds the filter of the value that aggregate
     returns: a whole number's for `_count`, a number's or a decimal's for
     `_sum` and `_avg`, the field's own for `_min` and `_max`. `_count`
     counts the values that are not `null`; `id: { _count }` counts the
     rows.
   - The aggregates it tests need not be in the result. A field with a
     read rule is refused to a caller other than Master, as in `by`
     (D-146 point 4).
2. `createManyAndReturn({ data, select, omit, include }, as)` creates as
   `createMany` does (D-135) and returns the created rows in the order of
   `data`, each as `create` returns it.
   `updateManyAndReturn({ where, data, select, omit, include }, as)`
   updates as `updateMany` does (D-133) and returns the updated rows in
   `id` order, the order it locks them in, each as `update` returns it. Both are all or nothing, as the call they
   extend.
3. An `orderBy` entry on an optional scalar field takes Prisma's
   `{ sort: 'asc' | 'desc', nulls: 'first' | 'last' }`:
   `orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } }`. Without
   `nulls`, `null` sorts last ascending and first descending, as today
   (D-94). It applies wherever the field sorts: a read, through a `one`
   relation, with `cursor` and `distinct`, and on a field of `by` in
   `groupBy`'s `orderBy`. A required field, an aggregate and `_relevance`
   take no `nulls`: the types refuse it, and at run time it fails with
   `INVALID_QUERY`.
4. A list (D-120, D-127) also filters with `hasEvery` (holds every one of
   these elements) and `isEmpty: true | false`, Prisma's names, typed by
   the element as `has` is. `hasEvery: []` matches every row, as
   PostgreSQL's `@>` does. PostgreSQL runs `"tags" @> $1` and
   `cardinality("tags") = 0`; a list's GIN index serves `hasEvery`, not
   `isEmpty`.
5. On a list field, every update (`update`, `updateMany`,
   `updateManyAndReturn`, `upsert`'s `update` and a nested `update`,
   D-138) takes one operation instead of a list, with an element or a
   list of elements:
   - `{ set }` replaces the list, as a plain list does;
   - `{ push }` appends the elements in their order, duplicates included,
     as Prisma's `push`;
   - `{ pushUnique }` appends each element the list does not hold, once:
     `['a']` with `{ pushUnique: ['a', 'b', 'b'] }` becomes `['a', 'b']`.
     It removes no duplicate the list already holds: `['a', 'a']` with
     `{ pushUnique: 'b' }` becomes `['a', 'a', 'b']`;
   - `{ remove }` removes every occurrence of each element and keeps the
     others in their order. An element the list does not hold is no
     error.

   Each element is checked as in a write of the list. An object with two
   operations or none fails as D-132 point 2 says, and `undefined` leaves
   the field unchanged (D-84). The kernel computes the new list as D-132
   points 3 and 4 compute a number: on the locked row, before the rules,
   so rules, validation and hooks see the list the row will hold. When it
   loads no row, the adapter computes it in the write:

   ```sql
   -- push
   "tags" = "tags" || $1::text[]
   -- pushUnique
   "tags" = "tags" || array(select e from unnest($1::text[]) with ordinality as o(e, i) where e <> all("tags") group by e order by min(i))
   -- remove
   "tags" = array(select e from unnest("tags") with ordinality as o(e, i) where e <> all($1::text[]) order by i)
   ```

6. A `json` field's filter, typed (D-125) or not, also takes a path
   filter, the operators of Prisma's PostgreSQL JSON filter in camelCase:
   `{ meta: { path: ['author', 'name'], equals: 'Ada' } }`.
   - `path` is required in this shape: a list of keys into the value, a
     key of digits indexing an array (`['tags', '0']`), `[]` for the
     whole value.
   - `equals` and `not` take a JSON value; `equals: null` matches a JSON
     `null` at the path.
   - `gt`, `gte`, `lt` and `lte` take a number or a string and match a
     value of the same JSON type: numbers by value, strings by code point
     (D-94).
   - `stringContains`, `stringStartsWith` and `stringEndsWith` take a
     string and match a string value. `%` and `_` are characters (D-94),
     and `mode: 'insensitive'` applies to them (D-140).
   - `arrayContains` takes a JSON value or a list of them and matches an
     array holding each, as PostgreSQL's `@>`: an object matches an
     element that holds at least its keys. `arrayStartsWith` and
     `arrayEndsWith` take a JSON value and match an array whose first or
     last element equals it.
   - A path the value lacks is `null` there, unknown in a comparison
     (D-94): no operator matches it, `not` included. It is not an error:
     one row may lack a key another has.
   - The operands are typed `JsonValue`, whatever the field's schema, and
     the path is not checked against it.
7. Transports (D-129):
   - `hasEvery` and `isEmpty` join the list filters of GraphQL, REST and
     the OpenAPI document.
   - The path filter joins `JSONFilter` in GraphQL, with
     `path: [String!]`, `String` operands for the string operators and
     `JSON` for the others, and the json filter of REST and the OpenAPI
     document.
   - A typed field (D-125) filters with that generic filter in GraphQL and
     the OpenAPI document, in place of `UserPrefsFilter`: an input cannot
     type `equals` as the field's value without `path` and as any JSON
     value with it. Its output and its write inputs keep their types, and
     the server's types keep the field's type for `equals` without
     `path`.
   - `having`, `createManyAndReturn` and `updateManyAndReturn` are server
     code, as `groupBy` (D-146), `createMany` and `updateMany`.
   - `nulls` and the list operations are server code, as the number
     operations (D-132 point 6): GraphQL cannot type a sort or a list
     input that is either a plain value or an object, and REST keeps the
     shapes GraphQL has.
8. The adapter contract gains `nulls` on an `Order`, `having` on
   `aggregate` (a filter whose leaves name a key or an aggregate by
   position, as its `orderBy` does), the conditions `hasEvery`, `isEmpty`
   and a json condition with `path`, and the list operations of a write.
   `memory()` runs each, and the contract suite checks them.
9. The fluent API of D-20's "Later" is rejected:
   `Post.findUnique(...).author()` is
   `include: { author: true }`, one query, typed the same.

Why:

- The top groups by an aggregate threshold ("authors with more than ten
  posts") are one `HAVING`, not every group read and filtered in code.
- Importing rows or closing tickets often goes on with the rows: a
  `findMany` after the write reads them again, and may see another
  write's.
- "Newest first, unpublished last" needs `nulls`; without it, an
  optional date sorted descending puts its `null`s first.
- Tags and followers change one element at a time. Read, change and write
  back loses one of two concurrent changes, as D-132 measured for
  numbers. `remove` has no Prisma counterpart, so Prisma code reads then
  `set`s; `pushUnique` is Parse's `AddUnique`, which a set of tags needs.
- A json field holds settings and metadata whose keys a query needs; a
  generic path opens it now, and a path typed from the schema can follow.

Rejected:

- A path checked at run time, failing when the value lacks it: a row may
  lack a key another row has, and a Standard Schema validates without
  describing its shape. A path typed from the field's TypeScript type
  waits for a measure of its cost on the type checker (D-06).
- Prisma's snake_case operators (`string_contains`): every other operator
  of the API is camelCase.
- Removing one occurrence per element, or naming it `pull` (Mongo's):
  `remove: 'draft'` means "no `'draft'` left", and `remove` reads plainly
  where `pull` reads as a fetch.
- Prisma's field references (`where: { stock: { lt: Product.fields.min } }`):
  two fields of one row compare in raw SQL (D-137) or through a field a
  hook keeps.
- Prisma's compound unique key (D-52), `skipDuplicates` and a global
  `omit` (D-135), and an auto-increment field (D-22): their reasons stand.
- `nulls` and the list operations in GraphQL: see point 7.
- A typed json field keeping `UserPrefsFilter` in GraphQL, with no path
  filter: a path into the value is the common query, an equality on the
  whole value the rare one.

Example:

```ts
// Before: every group read, then filtered in code
const groups = await Post.groupBy({ by: ['author'], _count: true }, as)
const prolific = groups.filter((group) => group._count > 10)
// After
const prolific = await Post.groupBy(
	{ by: ['author'], _count: true, having: { id: { _count: { gt: 10 } } } },
	as,
)

// Before: a write, then a read of the same rows
await Ticket.updateMany(
	{ where: { project: { id } }, data: { open: false } },
	as,
)
const closed = await Ticket.findMany({ where: { project: { id } } }, as)
// After
const closed = await Ticket.updateManyAndReturn(
	{ where: { project: { id } }, data: { open: false } },
	as,
)
const tags = await Tag.createManyAndReturn(
	{ data: names.map((name) => ({ name })) },
	as,
)

// Before: the drafts, with no publishedAt, first
await Post.findMany({ orderBy: { publishedAt: 'desc' } }, as)
// After: the drafts last
await Post.findMany(
	{ orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } } },
	as,
)

// Before: read, change, write back; a concurrent change is lost
const post = await Post.findUniqueOrThrow({ where: { id } }, as)
await Post.update(
	{ where: { id }, data: { tags: post.tags.filter((tag) => tag !== 'draft') } },
	as,
)
// After: computed on the locked row
await Post.update({ where: { id }, data: { tags: { remove: 'draft' } } }, as)
await Post.update(
	{ where: { id }, data: { tags: { pushUnique: ['ts', 'node'] } } },
	as,
)
await Post.findMany({ where: { tags: { hasEvery: ['ts', 'node'] } } }, as)
await Post.findMany({ where: { tags: { isEmpty: true } } }, as)

// Before: every row read to look inside its json
const rows = await Post.findMany({}, as)
const byAda = rows.filter((row) => row.meta?.author?.name === 'Ada')
// After
await Post.findMany(
	{ where: { meta: { path: ['author', 'name'], equals: 'Ada' } } },
	as,
)
await Post.findMany(
	{ where: { meta: { path: ['stats', 'views'], gt: 100 } } },
	as,
)
await Post.findMany(
	{ where: { meta: { path: ['keywords'], arrayContains: ['ts'] } } },
	as,
)
```

```graphql
{
	posts(where: { meta: { path: ["author", "name"], equals: "Ada" } }) {
		edges {
			node {
				title
			}
		}
	}
}
```

## D-150: Calendar dates, field descriptions and shared enums

Amended by D-216.

Choice: completes D-09 and D-109; amends D-65 and D-127 point 3.

1. The instant of D-65 is `f.dateTime()`: `timestamptz` on PostgreSQL, a
   JavaScript `Date`, `DateTime` in GraphQL, as `f.date()` is today.
   `createdAt` and `updatedAt` stay instants.
2. `f.date()` is a calendar day: the string `'2026-07-31'`, a real day of
   the years 0001 to 9999. Another string fails with `VALIDATION_FAILED` in
   a write and `INVALID_QUERY` in a filter (D-20). It takes `optional`,
   `unique`, `default`, `validate` and `dbName`, as `f.dateTime()` does,
   and no `list` (D-127 point 3). It filters with `equals`, `not`, `in`,
   `notIn`, `lt`, `lte`, `gt` and `gte`, sorts, and takes `_min` and
   `_max`, `groupBy`'s `by` and `distinct`.
   - PostgreSQL stores it as `date` and reads it as text: `pg` turns a
     `date` into a `Date` at local midnight, which shifts the day in any
     time zone west of UTC. `memory()` keeps the string.
   - GraphQL shows a `Date` scalar, an ISO 8601 day; OpenAPI shows
     `format: date`.
   - No default gives "today": the day depends on a time zone the server
     cannot guess. A `default` function says which one.
3. Every field builder takes `description`, a non-empty string: the
   kernel's, `one`, `many` and a plugin field type's (D-122).
   `defineModel`, `defineFunction` and `defineType` (D-109) take one too,
   and `defineEnum` in its options. It changes no behaviour. GraphQL shows
   it on the model's type, on its fields there and in its inputs, on a
   function's query or mutation field, on a type and on an enum; OpenAPI
   on the schema, the property and the function's operation.
   - A Standard Schema describes itself: Zod's `.describe()`, Valibot's
     `v.description()` or ArkType's `.describe()` writes a `description`
     into its JSON Schema (D-45). OpenAPI copies it already; GraphQL
     shows it on the type, the field, the argument or the enum made from
     that node, in a function's input and output and in a typed json
     field (D-125).
4. `defineEnum(name, values, { description })` returns a frozen shared enum, which
   `f.enumOf` takes in place of its values, single or with `list: true`
   (D-127). `name` is a GraphQL name. GraphQL shows one enum type of that
   name for every field that uses it, and OpenAPI one schema that each
   property references, where a local enum keeps one type per field
   (`PostStatus`). Storage does not change: text with a check (D-98).
   - Two enums of one name with different values stop the start, naming
     both fields; so does a name another GraphQL type has (D-109).
   - A function's schema enum with the id `Status` and the same values is
     the same type (D-109).
5. The adapter contract's `ScalarType` has `'dateTime'`, the type `'date'`
   had, and `'date'` for the day.

Why:

- A birthday stored as an instant is midnight UTC: read in New York it is
  the day before. A day is the value `'2026-07-31'`, and a string carries
  no zone to get wrong.
- `date` and `date-time` are the names of SQL, OpenAPI, GraphQL scalars and
  JSON Schema; `f.date()` for an instant misleads anyone who knows them.
  Nothing is published, so the rename costs one search and replace.
- A description is the documentation a client's tools show: GraphiQL,
  Swagger UI and the types generated from them.
- One status shared by three models is three GraphQL enums today, which a
  client cannot pass for one another.

Rejected:

- `f.day()` beside `f.date()`: `f.date()` would still read as a day.
- A day as a `Date` at midnight UTC, as Prisma's `@db.Date`: it shows the
  day before west of UTC.
- From the previous base:
  - `bigint`, as D-132 says;
  - `binary`, which files cover (D-32);
  - `time`, which no application of ours needs;
  - `uuid`, a string with a default of `crypto.randomUUID()`;
  - `float`, which `f.number()` already is;
  - `object`, which a json field with a schema types (D-125);
  - `immutable`, which an `update` field rule says (D-44);
  - `autoNow`, which a default function says;
  - `autoIncrement` (D-22);
  - `indexed`, which `indexes` say (D-52).
- Virtual fields and relations filtered by a `where`: they need their own
  decision (D-151).

Example:

```ts
// Before
const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		birthday: f.date(), // an instant: midnight UTC, the day before in New York
		lastSeenAt: f.date(),
		status: f.enumOf(['active', 'banned']),
	}),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({ status: f.enumOf(['active', 'banned']) }),
})
// GraphQL: enum PersonStatus, enum TeamStatus

// After
const Status = defineEnum('Status', ['active', 'banned'], {
	description: 'Whether the account can sign in.',
})
const Person = defineModel({
	name: 'Person',
	description: 'Someone with an account.',
	fields: (f) => ({
		birthday: f.date({ description: 'Day of birth, no time zone.' }),
		lastSeenAt: f.dateTime({ optional: true }),
		status: f.enumOf(Status),
	}),
})
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({ status: f.enumOf(Status) }),
})
await Person.create({ data: { birthday: '1990-07-31', status: 'active' } }, as)
await Person.findMany({ where: { birthday: { gte: '1990-01-01' } } }, as)
// GraphQL: one enum Status
export const ban = defineFunction({
	name: 'ban',
	description: 'Bans a person; they can no longer sign in.',
	input: z.object({
		person: z.string().describe('The id of the person to ban.'),
	}),
	run: async ({ input }) => {
		// ...
	},
})
```

```graphql
"""
Someone with an account.
"""
type Person {
	"""
	Day of birth, no time zone.
	"""
	birthday: Date!
	lastSeenAt: DateTime
	status: Status!
}

type Mutation {
	"""
	Bans a person; they can no longer sign in.
	"""
	ban(
		"""
		The id of the person to ban.
		"""
		person: String!
	): Boolean!
}
```

## D-151: Filtered relations and virtual fields

Amended by D-180, D-184, D-216, D-238.

Choice: completes D-37, D-44 and D-109; amends D-42.

1. A model's `.with` takes two more kernel keys, `relations` and
   `virtuals`, beside `access` and `hooks` (D-42).
2. A filtered relation is a `many` whose reads see only the rows its
   `where` keeps. Its filter is a function shaped like a read rule (D-10):
   `({ caller, where }) => where({ … })`, or `true` for no filter. It is
   declared in the model's `.with({ relations })`, keyed by the field, since
   a filter typed from the target in the field's own options is a cycle
   (TS7022) when two models filter each other.
   - It filters every read of the relation: `include` and `select`, its
     page, `_count` and `orderBy` by `_count` (D-134), and `some`, `every`
     and `none` in a `where` (D-20). It is ANDed with the caller's `where`
     and the target's read rule (D-86), in the same query (D-46).
   - Master's reads are filtered too: a filter shapes what the relation
     means, it is not a permission.
   - Writes stay physical: `connect`, `disconnect`, `create` and `onDelete`
     (D-54) act on the rows the database holds, hidden ones included. A
     filter fills in no value on `create`.
   - A filtered relation has no `set`, which would detach rows its writer
     never saw. A transport's generated inputs leave it out; server code
     that passes it fails with `INVALID_QUERY`: "User.posts is filtered;
     use connect and disconnect, not set."
   - A `one` takes no filter: a key either points to a row or does not.
3. A view is a read-only `many` that reuses the link of another `many` of
   the same model: `f.many(() => Post, { from: 'posts' })`. It is needed
   because pairing allows one `many` facing a given `one` (D-37); `from`
   works for one-to-many, many-to-many and a model's relations to itself.
   - Startup stops when `from` names no `many` of that model, or one with
     another target, or a view, and when a view has no filter in
     `.with({ relations })`.
   - A view has no inverse, no `onDelete`, and no place in writes: it is
     absent from `data` in the types and in a transport's inputs.
4. A virtual field is part of a model and computed on read, as a function
   (D-27) that reads the row's neighbouring fields. The field declares its
   output and, in its options, its `input` and `needs`:
   `f.virtual(output, { input, needs, description })`. The model's
   `.with({ virtuals })` gives it `run` or `runMany`.
   - The output is one of D-109's table, behind an arrow when it is a model
     or a type, as relations are (D-37): a Standard Schema,
     `() => Image`, `() => [Image]`, `() => Image.nullable()`, a
     `defineType`. A list of models takes its page in its `input`, as a
     function does (D-109).
   - `input` is one Standard Schema of an object, validated once per
     request. Its properties are the field's arguments, flat: GraphQL
     `thumbnail(size: 200)`, the query API and REST
     `select: { thumbnail: { size: 200 } }`. A bad input fails with
     `VALIDATION_FAILED`, the issue's path starting at the field
     (`select.thumbnail.size`). A virtual returning a model also takes
     `select`, `include` and `omit` for the rows it returns; an input
     property of one of these names stops startup.
   - `needs` lists the fields `run` reads: `needs: ['cover']`. `record` is
     typed from it, the `id` always included, and the kernel reads them even
     when the client did not select them. A name that is not a scalar field
     of the model fails to compile in `.with({ virtuals })`. It lives in the
     field's options because the model's `.with` cannot be generic: a
     generic `.with`, even as an overload, turns mutual relations into the
     TS7022 cycle that D-44 describes.
5. `run` or `runMany`, exactly one per virtual, which the types check:
   - `run({ caller, input, record })` returns the field's value for one row;
   - `runMany({ caller, input, records })` returns one value per record, in
     order, for one page, so a per-row query becomes one query per page. A
     list of another length fails the call, naming the field.
   - Each may be async, and its return value is checked against the output
     at compile time.
   - Outside production, a `run` that queries the database once per row
     logs a warning, seen through D-36's async context:
     "Stage.images: run queried the database once per row; use runMany."
6. A virtual runs as the caller, Master included. It is server code: the
   scalars of a returned model are those it returned, and their relations
   are read again by `id`, as the caller (D-109 point 5). It counts toward
   the row budget as a function's output does (D-109 point 8). An error
   thrown in it fails the call, as a function's does (D-28).
7. Reads:
   - A scalar virtual without an input is in the default row, as a scalar
     field is; one with an input, or returning a model or a type, is read
     only when selected or included. `true` selects one whose input
     properties are all optional.
   - A virtual is never in `where`, `orderBy`, `cursor`, `distinct`,
     `groupBy`, an aggregate, `data`, an index or storage, nor in the
     `record` that hooks and rules receive.
8. Access. A virtual is readable by whoever reads its row. It is left out
   of a row when the caller cannot read one of its `needs` (D-44), so it
   cannot leak a hidden field. The field's own `.with({ access: { read } })`
   hides it further, as for any field (D-44).
9. Transports. GraphQL shows a virtual as an output field of the model's
   type, with an argument per input property; OpenAPI as a `readOnly`
   property, its input in the `select` of the model's query parameters
   (D-129). A field added through `graphqlPlugin({ extend })` (D-107 point 9) stays the way out for what a virtual does not cover: interfaces,
   unions, renaming a generated field.

Why:

- A list "the published posts of a user" is declared once and holds
  everywhere it is read, in the same query.
- Filtering only reads keeps one rule: what is written is what the
  database holds. A filter may depend on the caller or use any operator, so
  no value can be derived from it for a `create`.
- A virtual replaces the per-field resolvers written by hand with Nexus over
  Parse: it is typed from its model, works over REST and GraphQL alike
  (D-129), respects the read rules, and batches per page.
- Typing: checked in a spike on 2026-10-28. With `needs` in the field's
  options and a non-generic `.with`, the repository typechecks with no new
  error; `record` is typed from `needs`; mutual virtuals returning each
  other's models compile; and `run` with `runMany`, a wrong return type, a
  list of another model, a missing rule and an unknown `needs` all fail to
  compile. A generic `.with` broke the existing tests of mutual relations
  (`auth`, `soft-delete`, `access.test.ts`).

Rejected:

- Rails' writes through a scoped association, which fill the scope's
  values on `create` and replace only the visible rows: the write would
  depend on the filter and the caller.
- `set` on a filtered relation, physical or limited to visible rows.
- A filter in the field's options, typed from the target: a cycle when two
  models filter each other.
- A filter on a `one`.
- A virtual computed by a `where` per row: one query per parent (D-46).
- Field builders as a virtual's output (`f.virtual(f.string())`): D-109
  describes data with Standard Schemas.
- `needs` in `.with({ virtuals })`: it needs a generic `.with`.
- A virtual stored or indexed (a generated column): not needed yet.

Example:

```ts
// Before: Parse and Nexus, a resolver per field, GraphQL only
t.field('images', {
	type: 'CampaignStageImage',
	list: [true],
	resolve: async (root, _args, context) =>
		(await getMediaLoaders(context).images.load(root.objectId)).map((image) =>
			image.toJSON(),
		),
})

// After
const Stage = defineModel({
	name: 'Stage',
	fields: (f) => ({
		cover: f.string(),
		owner: f.one(() => User),
		images: f.many(() => Image),
		shown: f.many(() => Image, { from: 'images' }),
		thumbnail: f.virtual(z.string(), {
			input: z.object({ size: z.number().int().positive() }),
			needs: ['cover'],
		}),
		maps: f.virtual(() => [Image], {
			input: z.object({ first: z.number().int().max(50).default(10) }),
		}),
	}),
}).with({
	access: allow.public,
	relations: {
		images: { where: ({ where }) => where({ deleted: false }) },
		shown: {
			where: ({ caller, where }) =>
				where({ OR: [{ public: true }, { owner: { id: caller.id } }] }),
		},
	},
	virtuals: {
		thumbnail: {
			run: ({ record, input }) => `${record.cover}?w=${input.size}`,
		},
		maps: {
			runMany: async ({ caller, input, records }) => {
				const all = await Image.findMany(
					{
						where: {
							kind: 'map',
							stage: { is: { id: { in: records.map((r) => r.id) } } },
						},
						include: { stage: { select: { id: true } } },
					},
					{ as: caller },
				)
				return records.map((r) =>
					all.filter((i) => i.stage.id === r.id).slice(0, input.first),
				)
			},
		},
	},
})

await Stage.findMany(
	{
		select: {
			thumbnail: { size: 200 },
			maps: { first: 5, select: { url: true } },
			_count: { select: { shown: true } },
		},
	},
	{ as: caller },
)
```

```graphql
type Stage {
	cover: String!
	# images and shown: connections as any many (D-107), their rows filtered
	thumbnail(size: Int!): String!
	maps(first: Int): [Image!]!
}
```

## D-152: Files

Amended by D-200 and D-202.

Choice: completes D-32 and D-122; amends D-32 (no `local()`), D-89 (a
plugin model knows its name) and D-122 points 2 and 5.

1. `@ultimabase/files` provides `filesPlugin({ storage, access, maxSize })`,
   the `file(options)` field type and two storage adapters: `s3({...})` and
   `memoryFiles()`, which tests use. `local()` is dropped: a server's disk
   is lost when it is replaced, and a local S3 emulator covers development.
   `access.upload` is a caller rule (D-27); it defaults to a signed-in user
   or Master, and `allow.public` opens uploads to everyone. `maxSize` is the
   limit of every file field that sets none, 50 MB by default, as
   `httpPlugin`'s `bodyLimit` is for JSON bodies: a default, not a ceiling,
   checked at start as the field's.
2. No file is ever orphaned: every object in the storage has a row in the
   plugin's `FilesBlob` model, and every row's object is deleted with it.
   This is the plugin's first rule, and each step below keeps it.
3. `s3({ bucket, region, endpoint, accessKeyId, secretAccessKey, publicAcl,
publicUrl })` speaks to any S3-compatible storage (AWS, DigitalOcean
   Spaces, MinIO, SeaweedFS).
   - The first five keys are required; one that is `undefined` or empty
     stops startup, naming it, so a missing environment variable is seen
     at once.
   - `publicAcl: true` sends `x-amz-acl: public-read` with a public file,
     which Spaces needs; `publicUrl` is the base of a public file's URL (a
     CDN), the storage's own URL otherwise.
   - URLs are path-style (`${endpoint}/${bucket}/${key}`), which every
     S3-compatible storage accepts.
   - Requests are signed with SigV4 query presigning on `node:crypto`,
     which is synchronous, so a read signs its URLs while it decodes. It
     covers `PUT`, `GET`, `DELETE` and `ListObjectsV2`; no AWS SDK.
4. `file(options)`:
   - `optional`, `list`, `maxSize` (bytes, the plugin's by default), `accept`
     (MIME types or patterns: `['image/*', 'application/pdf']`), `public`
     (false by default), `inline` and `variants`.
   - `inline` names values computed once at upload, each JSON of 2 KB at
     most: a function of `{ body, type, name }`, or `{ run, schema }` to
     type it in the transports (a blurred placeholder, a page count).
   - `variants` names other files made from the upload, each a function
     of `{ body, type, name }` returning `{ body, type }` (a thumbnail).
     They are made in parallel at upload; one that fails fails the upload.
   - The body is held in memory only when the field has `inline` or
     `variants`; otherwise it is streamed to the storage.
   - A key added to `inline` or `variants` later reads `null` for the
     files stored before it.
5. Upload: `POST /files?for=Post.cover&name=photo.jpg`, the file as the
   raw body, through the HTTP plugin (D-16); `files.upload(body, { for,
name, as })` does the same from server code.
   - `Content-Length` is required (411), a body over `maxSize` gets 413,
     a caller `access.upload` refuses 403. The answer is 201 `{ id }`.
   - The type is read from the first bytes with `file-type`. A detected
     type must match `accept`; an undetected one is accepted only when
     the declared `Content-Type` is listed in `accept` as is (`text/csv`,
     `image/svg+xml`); otherwise the upload gets 415.
   - SVG and undetected types are served with `Content-Disposition:
attachment`, so a browser never runs them. Files are served from the
     storage's origin, never the application's, so a file cannot read the
     application's cookies. S3 cannot send `X-Content-Type-Options`.
   - The `FilesBlob` row, `pending` for one hour, is inserted before the
     body is streamed; when the upload fails, its object and its row are
     deleted.
6. Writes take ids: a single field an id or `null`; a list a list of ids
   (the new list), `{ set }`, `{ push }`, `{ pushUnique }` or `{ remove }`,
   as kernel lists (D-149). A list holds each file once: `push` of an id
   it holds fails, `pushUnique` skips it.
   - An id is accepted when it is pending, for this `Model.field`, not
     expired, and uploaded by the caller (Master attaches any), or when it
     is already this row's in this field. A public upload has no uploader,
     so any caller may attach it.
   - The list is computed in the plugin's `beforeUpdate`, on the row the
     write has locked, so two concurrent pushes keep both files.
   - Any other id fails the write with `VALIDATION_FAILED`, naming the
     field.
7. Reads: `{ id, name, type, size, url, inline, variants }`, each variant
   `{ type, size, url }` or `null`. A private file's URL is presigned for
   one hour; a public file's is stable. Keys are `public/<id>` and
   `private/<id>`; a variant is a blob of its own.
8. `FilesBlob` is the plugin's model, hidden from other plugins and from
   the transports (D-110): `key`, `name`, `type`, `size`, `field`,
   `uploadedBy`, `state` (`pending`, `attached`, `released`), `attachedTo`
   (`Post.cover:<id>`), `variantOf`, `inline`, `deleteAfter`. Its row is
   the truth; the field stores a copy of its metadata for reads.
9. Lifecycle, in the write's transaction (D-36):
   - after a create or an update, the files the row gained become
     `attached`, with their variants; a file that expired or was attached
     elsewhere in between fails the write, which rolls back;
   - the files it lost, and all of a deleted row's, become `released`;
   - after the commit, the released objects are deleted, then their rows;
   - a soft delete keeps its files (D-96): it is an update.
   - A sweep, at startup and every 10 minutes, first marks the expired
     pending rows `released`, so no write can attach them, then deletes
     their objects, then their rows. The two delays are fixed.
   - `files.check({ delete })` compares the storage's keys with
     `FilesBlob` and reports the objects without a row and the rows
     without an object; `delete: true` deletes the first.
10. Kernel, amending D-122:
    - A field type takes options of its own (`options: ['maxSize', …]`),
      and `stored`, `decode`, `encode`, `schema` and `toJSON` receive the
      field's options. Its stored field may take a value as its default,
      which is the column's: a list of files is a `json` field whose
      default is `[]`.
    - A field type's plugin runs its hooks on every model holding one of
      its fields, as if the model used it (D-89); such models lose the
      fast delete path of D-102. A plugin model's facts carry its `name`,
      and a plugin reads each of its fields' own options in the model's
      `fieldTypes`, as an upload reads `Post.cover`'s `maxSize`.
    - A field type may give a `shape`, a Standard Schema of what a client
      reads, or a function of the options. GraphQL types the field from it
      (`PostCover`, `PostCoverInline`), as a `json` field with a schema;
      OpenAPI describes it. Without one, it stays the `JSON` scalar.

Why:

- Files are the first field type that reaches outside the database, so
  orphans are their failure: a row pointing at a missing object, or an
  object nothing points at, billed forever. One plugin model, written in the
  same transaction as the row, and deletions after the commit, make both
  impossible; the sweep and `check` cover crashes.
- A raw body, not multipart: one upload per file, streamed, its size known
  before it is read; a form sends the ids with the rest of its fields.
- Ids, not uploads, in writes: a write stays JSON over REST and GraphQL
  (D-129), and a file is checked once, at upload.
- `inline` at upload and `variants` as files: a placeholder must come with
  the row, without a second request, and a thumbnail is a file of its own,
  not resized on every read.
- SigV4 on `node:crypto` is about 100 lines; the AWS SDK is megabytes,
  and an async signer could not sign while a row decodes.
- Tests never write to a real storage: `memoryFiles()` in `yarn validate`,
  SeaweedFS from `compose.yaml` in `yarn test:s3`.

Rejected:

- Multipart uploads; uploads inside a GraphQL or REST write.
- `local()` storage.
- Variants made on read, or by a resizing service: they cost on every read
  or need another service.
- Parse's `_File` without a lifecycle, which leaves every replaced file
  in the storage.
- The AWS SDK, `aws4fetch` (async).
- Virtual-host URLs (`bucket.endpoint`), which some emulators refuse.

Example:

```ts
// Before (D-32)
export const Post = defineModel({
	name: 'Post',
	fields: () => ({ cover: file({ optional: true }) }),
})
plugins: [filesPlugin({ storage: s3({ bucket }) })]

// After
export const Post = defineModel({
	name: 'Post',
	fields: () => ({
		cover: file({
			optional: true,
			accept: ['image/*'],
			maxSize: 10_000_000,
			public: true,
			inline: { blur: { run: blurOf, schema: z.string() } },
			variants: { thumb: thumbOf },
		}),
		attachments: file({ list: true, accept: ['application/pdf'] }),
	}),
})
plugins: [
	filesPlugin({
		storage: s3({
			bucket: env.SPACES_BUCKET,
			region: 'fra1',
			endpoint: 'https://fra1.digitaloceanspaces.com',
			accessKeyId: env.SPACES_KEY,
			secretAccessKey: env.SPACES_SECRET,
			publicAcl: true,
		}),
	}),
]

// A client uploads, then writes the id
const { id } = await fetch('/files?for=Post.cover&name=cover.jpg', {
	method: 'POST',
	body: blob,
}).then((r) => r.json())
await Post.update(
	{ where, data: { cover: id, attachments: { push: pdfId } } },
	as,
)

post.cover
// { id, name: 'cover.jpg', type: 'image/jpeg', size: 81234,
//   url: 'https://…/public/…', inline: { blur: 'data:…' },
//   variants: { thumb: { type: 'image/webp', size: 4120, url: '…' } } }
```

## D-153: Mounted routes that read their own body

Choice: amends D-106 point 5 and D-107 point 2.

1. `mount(routes, { bodyLimit: false })` mounts routes that read their own
   body: the HTTP plugin's limit (1 MB by default) does not apply to them.
   Without the option, a mount keeps it.
2. A request skips the limit when it matches a route such a mount declares
   with a method (`get`, `post`, `on`). Its `use` and `all` routes are
   middlewares that match any request, so they never lift the limit.
3. Such a route enforces its own limit, as `POST /files` does with the
   field's `maxSize`: a body without `Content-Length` gets 411
   (`LENGTH_REQUIRED`), one over the limit 413 (`PAYLOAD_TOO_LARGE`), a
   type `accept` refuses 415 (`UNSUPPORTED_MEDIA_TYPE`). Node's server
   reads no more bytes than `Content-Length` says.

Why:

- A file is up to 50 MB by default and JSON stays under 1 MB: one global
  limit is either too small for files or too large for every JSON route.
- The route that knows the limit, the field's `maxSize`, is the one that
  enforces it; every other route keeps the HTTP plugin's.

Rejected:

- A larger global limit: every JSON route, REST and GraphQL included,
  would buffer 50 MB.
- Mounting the files route before the limit: the application's routes come
  first (D-107), and the caller is read after the limit.
- A list of exempt paths in `httpPlugin({ … })`: the application would have
  to know each plugin's paths.

Example:

```ts
// Before (D-107): a mounted route gets the 1 MB limit
api: ({ plugins }) => plugins.http.mount(uploads)
// POST /files?for=Post.cover&name=a.jpg, 5 MB
// 413 { code: 'PAYLOAD_TOO_LARGE', message: 'The body is over 1048576 bytes.' }

// After
api: ({ plugins }) => plugins.http.mount(uploads, { bodyLimit: false })
// POST /files?for=Post.cover&name=a.jpg, 5 MB, cover's maxSize 10 MB
// 201 { id: '…' }
// POST /posts, 5 MB of JSON: still 413
```

## D-154: Realtime: live lists and live rows

Amended by D-163, D-166, D-178, D-186, D-187, D-195, D-196, D-223, D-226,
D-229 and D-230.

Choice: completes D-25; amends D-106 (WebSocket upgrades), D-107 (the
`Subscription` type), D-109 (live functions) and D-129 (live reads over
SSE). Three goals rank every choice below, in this order: performance with
many writes and many subscribers, live lists of thousands of rows, and
security, which holds whatever the first two cost.

1. `@ultimabase/realtime` exports `realtimePlugin(options)` and the model
   entry `realtime()`. A model is live when its `use` lists `realtime()`;
   `.with({ realtime: { maxLive } })` sets its limit. `realtimePlugin` is
   an engine that needs no transport and no `httpPlugin`: `graphqlPlugin`
   and `restPlugin` each declare it optional (D-16) and, when it is
   present, serve the live reads of the models whose `use` lists
   `realtime()`. The plugin is optional, its package is not: both import
   `realtimePlugin` to declare it, so `@ultimabase/realtime` is a required
   peer of `@ultimabase/graphql` and `@ultimabase/rest`, one copy as for
   `@ultimabase/roles` (D-126), and the starter lists it (amended
   2026-10-30). The engine offers transports `connect(request)`, a viewer
   of the request's caller, whose `list` and `row` follow a read and send
   messages of their own shape, which each transport writes as point 4
   says.
2. A live read has the name, arguments, selection and type of the read it
   follows:
   - GraphQL: `subscription { campaigns(where, orderBy, first) { … } }`
     returns `CampaignConnection!`, and `campaign(where: { id })` returns
     `Campaign`, as their queries do (D-107). Replacing `subscription` by
     `query` gives the same data once, which server rendering uses.
   - REST: the list or row URL with `Accept: text/event-stream` (D-129).
   - A selection that reaches a model which is not live is refused at
     subscribe, naming the model: no part of a live result is stale.
3. A live list follows a window from the top of its order: `first` (or
   `take`), never `after`, `before`, `last` or `skip`. `first` is at most
   `maxTake` (100) per request, as any read (D-107). The window grows by
   `fetchMore` (point 7), up to `maxLive` rows, 1 000 by default, set as
   `realtimePlugin({ maxLive })` and per model. A nested list counts its rows
   times its parents', as `maxRows` counts them (D-107), so it needs a
   `take`. Beyond `maxLive` the
   subscribe or the growth fails with `VALIDATION_FAILED`: `first is over
1000, the most a live list follows.` Without `first`, a live list follows
   the model's default `take`, as its query reads. A subscription is not
   counted by the request row budget (`maxRows`, D-107): `maxLive` and
   `maxConnectionRows` bound it.
4. Messages. The first is the read's result, `{ data }`. Each later one
   holds only what changed, under `extensions.live`, a key GraphQL reserves
   for data outside the schema:
   ```json
   {
   	"extensions": {
   		"live": {
   			"revision": 13,
   			"changes": [
   				{ "remove": "c2", "gone": false },
   				{
   					"upsert": { "cursor": "…", "node": { "id": "c9" } },
   					"after": "c4"
   				}
   			],
   			"totalCount": 42,
   			"pageInfo": { "hasNextPage": true, "endCursor": "…" }
   		}
   	}
   }
   ```
   - `upsert` places a row after another, or first with `after: null`; a
     row that moves is one `upsert`.
   - `remove` is a row that left the window; `gone: true` when it was
     deleted or the caller can no longer read it.
   - `totalCount` and `pageInfo` come only when they changed and are
     selected; `pageInfo` comes whole.
   - `changes` comes only when `edges` is selected. An `upsert` is the edge
     as the subscription selects it, under the first key that selects
     `edges`; a client selects the node's `id` to apply `after` and `remove`.
   - `revision` grows by one per message, and every `{ data }` result, the
     first one included, carries it as `extensions.live.revision`; a missing
     number makes the client subscribe again from scratch.
   - A read the engine closes, not the client, ends with
     `{ errors: [{ message: 'The live read closed.', extensions: { code:
'INTERNAL' } }] }`, then completes.
   - A live row sends `{ data }` again on each change, `null` once it is
     deleted or unreadable.
   - A subscribe with `extensions: { live: { mode: 'page' } }` gets `{ data }`
     with the whole window on each change instead: for clients without the
     client package, its window capped at `maxTake`, Master's too.
   - Changes within 50 ms are sent as one message.
5. Transport:
   - GraphQL over WebSocket on the GraphQL path, with the `graphql-ws`
     protocol (`graphql-transport-ws`), which Apollo's `GraphQLWsLink`
     speaks, on `ws`. The socket is served, and `Subscription` exists, only
     when `realtimePlugin` is present. Queries and mutations sent over it
     run as over HTTP, with the same rules and budget; its cookies are read
     only, so a field that sets one fails. A connection is one viewer: when
     its caller is no longer the same user, the socket closes with `4403`.
     A client message is at most 1 MB, and a socket that has not answered
     the last ping, sent every 12 s, is cut.
   - `httpPlugin`'s API gains `upgrade(path, accept)`, called from a
     plugin's `api`, one plugin a path: `accept` receives Node's request,
     socket and first bytes, as `ws`'s `handleUpgrade` reads them, the
     `Request` that `identify` reads, and the client's `address`. An upgrade on a path no plugin takes
     is a 404. `stop` closes the sockets still open at its 10 s end (D-106).
   - The caller is the upgrade request's (cookie or `Authorization`, D-112),
     or `connection_init`'s `{ authorization: 'Bearer …' }`. An upgrade
     whose `Origin` is neither the server's own nor one the HTTP plugin's
     CORS allows is a 403 before any plugin sees it, so another site cannot
     borrow the cookie; one without `Origin` comes from no browser.
   - REST sends `event: data` and `event: live` SSE events holding the same
     JSON. `event: data` is the body the same `GET` returns; a row that does
     not exist or is gone is `null`, not a 404. `event: live` is
     `extensions.live`, its upsert an edge (a node under list pagination);
     in page mode (`mode=page`) each change is an `event: data`. Each event's
     `id` is its revision. A read the engine closes ends with
     `event: error` (`INTERNAL`, `The live read closed.`); a caller that
     changed ends the stream without one, and `EventSource` reconnects.
     Every SSE request has its own caller, checked as a WebSocket's is; an
     error before the first event is the usual JSON response, and a model
     that is not live is a `BAD_USER_INPUT` 400. A quiet stream sends a
     comment every 12 s; the plugin's `stop` ends the open streams.
   - Compression: WebSocket `permessage-deflate` above 1 KB; SSE gzip with
     `node:zlib`, flushed after each event, when the request accepts it.
     Hono's `compress` is not used: it buffers.
   - A connection holds at most 100 subscriptions and follows at most
     10 000 rows in all, set as `realtimePlugin({ maxSubscriptions,
maxConnectionRows })`; a subscribe past either fails with
     `VALIDATION_FAILED`.
6. `@ultimabase/live` is the client:
   - `.` applies a message to a result (`applyLive(result, message)`) and
     reads SSE;
   - `./apollo` is `ultimabaseLive()`, a link placed before the WebSocket
     link, which applies the changes and hands Apollo the whole result;
   - `./react` is `useLiveSubscription(document, options)`, which takes
     `useSubscription`'s options and returns its result plus `fetchMore`.
     React and Apollo are optional peer dependencies.
   - `applyLive` takes the list, a connection or an array of rows, and
     returns a new one; it places rows by their `id` (`node.id` under a
     connection), and a row without one fails: select the node's `id` to
     follow a live list. A message naming a row the list does not hold
     returns `undefined`: the list is out of step and is read again.
   - `liveFetch(url, { headers })` reads a live list or row over `fetch`,
     not `EventSource`, which sends no `Authorization` and reconnects
     without the token. `subscribe(listener)` hands each whole result and
     returns what stops it; `fetchMore({ first })` grows the list.
     Disconnected, it reconnects with its token, backing off from 100 ms to
     5 s, and resumes within the 10 seconds. `eventsource-parser` splits
     the stream: line endings, multi-line data and chunks a proxy cuts are
     its job, not ours.
   - `fetchMore({ first })` adds `first` rows and resolves once the grown
     result arrived. The link grows the variable that the root field's
     `first` (or `take`) argument reads, whatever its name; without one,
     `fetchMore` is refused. The hook passes the link an object as the
     subscription's `live` context, on which the link sets `fetchMore`; a
     subscription made without the hook grows the same way. The link
     subscribes again with the grown variable in the tick it completes, so
     graphql-ws keeps the socket the token holds on.
   - The link evicts a `gone` row from Apollo's cache, by its `__typename`
     and `id`. Out of step, the link and `liveFetch` read the list again
     without the token.
   - Each hook holds its own subscription (`queryDeduplication: false`),
     which its `fetchMore`, the same function across renders, grows; before
     the subscription runs, `fetchMore` is refused.
   - Peers: `@apollo/client` 4 and its `rxjs`, React 18 or 19. Tests run
     against a running server, the hook's under `happy-dom`: they wait for
     the render that shows the result, since the socket's messages arrive
     outside React's `act`.

     ```ts
     const link = ApolloLink.from([ultimabaseLive(), new GraphQLWsLink(ws)])
     const { data, fetchMore } = useLiveSubscription(TasksDocument, {
     	variables: { first: 25 },
     })

     const tasks = liveFetch('/api/tasks?first=25', { headers })
     const stop = tasks.subscribe((list) => render(list))
     await tasks.fetchMore({ first: 25 })
     ```
7. `fetchMore({ first })` grows the window without a new result in between.
   Apollo's `useSubscription` resets `data` to `undefined` when a variable
   changes, so the hook keeps its variables: the link completes the
   operation and subscribes again with the grown `first` on the wire and
   `extensions.live.resume`, an opaque token. The link emits the grown
   result on the same observable.
   - A live list's first result carries its token as
     `extensions.live.resume`; over SSE it is the stream's first event,
     `resume`, before `data`, since a browser's `EventSource` reads no
     header and a cross-origin `fetch` reads only those CORS exposes. The
     new request takes it as a `resume` parameter. A read keeps its token
     across resumes.

     ```
     subscribe { query, variables: { where, first: 50 }, extensions: { live: { resume } } }
     GET /api/tasks?first=50&resume=…

     event: resume
     data: "6f1c…"
     ```

   - The transport keeps every completed live list 10 seconds, with what it
     sent: `complete` carries nothing, so any may be resumed. A kept list
     still follows its changes, which wait, and still counts against the
     connection's limits.
   - A resume sends the changes that waited, then the new rows only, as a
     `changes` message; the revision goes on. A grow always sends that
     message, empty when no row follows, so that `fetchMore` knows it is
     done.
   - Over SSE, a resume may arrive before the server sees its client leave
     the previous request. The resume then ends that request and takes its
     list, as if its client had left.
   - The token holds on its own WebSocket connection. Over SSE, where each
     request is a connection, it holds for the same user: the kept read
     takes the new request's caller and plans again under its rights.
   - A token that does not apply starts the read afresh, with no error and
     a new token: unknown, expired, another connection or user, another
     read (model, `where`, `orderBy`, selection, `totalCount`, mode), a
     smaller `first`, or a live row.
8. Change feed, from the adapter, through the kernel:
   - A plugin takes the feed with two hooks, called in declaration order;
     one that throws is logged and the others still run:

     ```ts
     definePlugin({
     	name: 'realtime',
     	manifest,
     	changed: (changes, context) => {}, // committed changes
     	missed: (context) => {}, // changes may have been lost
     })
     ```

     A change is one of:

     ```ts
     { kind: 'insert' | 'update' | 'delete', model, ids?, fields? }
     { kind: 'link' | 'unlink', model, field, pairs? } // [modelId, targetId]
     ```

     An update's `fields` are those it set. `ids` and `pairs` are absent
     past `feedIds` (1 000) for one entry, `fields` past `feedFields`
     (1 500 characters of JSON); absent, they resync the windows that read
     the model.

   - The adapter gets the feed in `start(schema, logger, feed?)`, only when
     a plugin has `changed`; otherwise it does no feed work at all.
   - A write reports only what it changed: no row is loaded for it, so the
     unloaded deletes of D-102 stay unloaded. A link found already there
     is not reported, nor a delete's implicit unlinks.
   - The kernel calls the hooks outside every async context: a hook's
     queries never join the write that made the changes, whose transaction
     `memory()` may still hold. Changes heard once the application stopped
     are ignored.
   - `postgres()`: each write statement notifies its own changes from a
     CTE, with no round trip of its own and no `BEGIN` added (D-99).
     Each changed part sends `pg_notify` on `ultimabase:<schema>` by
     chunks of 150 ids or 75 pairs, under the 8 000 bytes of a payload.
     PostgreSQL delivers them only once the transaction commits. One
     listening connection per server batches what a tick brought into one
     `changed`. When it drops, it reconnects, backing off from 100 ms to
     5 s, then calls `missed`, and every window resyncs.
   - `memory()` delivers each commit's changes once it is committed.
   - The feed covers every model, plugins' included (D-110).
   - Writes made outside UltimaBase, as raw SQL, are not seen.
9. Following a write, never by running the whole read again:
   - At subscribe, the server plans the read once and keeps its effective
     filter: the `where`, the read rules and every `beforeFind` (D-71,
     D-86), as `QueryScope.readable` gives it.
   - Per window row it keeps the id and the order keys, and per selected
     relation the rows it reached; it never keeps the serialized row. Every
     level of the selection reads its `id`, which tracks the rows.
   - The window holds one row more than it shows: whether rows follow needs
     no read.
   - The window comes from the stored rows under the effective filter; its
     rows are then read as the caller, by `findMany` on their ids. A row the
     plan places but the caller cannot read leaves the window, `gone`; past
     three such rounds the live read fails.
   - A changed row is a candidate when it is inserted, or when its update
     sets a field the filter or the order reads.
   - A flush reads each candidate row once for every live read. A filter
     that reads the row alone is evaluated on it in memory, as `memory()`
     evaluates it; the others are checked in one query per live read,
     `WHERE id IN (…) AND (filter)`. A `_search` condition is one of the
     others: each database ranks a search its own way (D-148).
   - A flush's reads are shared, as LiveQuery's are in Parse, but never
     less exact: the benchmark showed one query per subscriber and per
     write on a list many follow (1000 statements, 343 ms for 1000
     subscribers). A row a live read places or resends is read as its
     caller from the row the flush loaded: the read rules, every
     `beforeFind`, the field rules and the virtuals run as for `findMany`,
     and its filter is checked in memory when it reads the row alone and
     the selection includes no relation. A row leaving a full window
     brings in the next ones from one read per flush of the read's own
     filter after the same row, its rights checked in memory. Any other
     read, or a refill whose rights left too few rows, runs as the caller
     on the database, as before.
   - Shared windows, an in-memory check of the filter's equalities before
     the row is read, and one query for every filter are left for the
     benchmark (point 13) to call for.
   - A live list's `orderBy` takes the model's own fields. A sort through a
     `one` relation, by `_count` or by `_relevance` is refused at
     subscribe: a write to another row would move this one.
   - A matching row is placed by its order keys with a binary search over
     the window. A row placed after the last one is outside. A row leaving
     a full window brings in the next one with one read after the last
     row's keys. A deleted row past the window changes the count only.
   - A write to a model the filter reaches through a relation (a
     `CampaignMember` added) finds the rows it affects with one indexed
     query on that relation, then follows them as above. A link lost where
     the target stores it, or a row deleted there, makes every window row
     a candidate; under `NOT`, `isNot`, `every`, `none` or `is: null`, where
     a lost link may add a row, the window is read again.
   - A write to a selected `one` relation's row, or to a nested list's row,
     sends the window rows that point to it again. A nested filter or order
     that reaches another model sends every window row again on any write
     to it.
   - `totalCount` costs one count per message that adds or removes rows,
     only when it is selected.
   - A selected relation is read once per message for all the rows that
     need it.
10. Rights, which must never be served from a stale caller:
    - While the kernel builds a caller (`identify`, the plugins' `caller`)
      and runs `beforeFind`, it records each read: its model, its `where`
      and the ids it found, and each relation it followed (an include, a
      sort, a count or a group through it) with that relation's filter and
      the ids it reached. A write rebuilds the caller when it changes a
      recorded id, when its row passes a recorded `where`, or when it links
      or unlinks a relation a recorded read follows or filters through. A
      `where` that reads another row, a read without ids (a count) facing
      any write to its model, and a change past `feedIds` all rebuild it.
      A rebuild plans each live read again. A live read whose plan changed
      resyncs; one that can no longer be planned closes. When the caller is
      no longer the same user, or `identify` fails, every live read closes.
      A session deleted or revoked (D-112) therefore closes them, and a role
      removed (D-123) resyncs them.
    - A plugin context's `expires(at)` says that the caller being built
      stops holding at `at`, as a session that ends; outside a caller's
      construction it does nothing. The earliest time recorded while the
      caller and each live read's plan were built rebuilds the caller then,
      and at least a second after the last build, so a past time is no
      loop. `authPlugin` gives each session's end, renewal included, so a
      session that expires closes its subscriptions at its hour.
    - Every caller is rebuilt every 5 minutes, which catches what a hook
      reads outside the database. `realtimePlugin({ refresh })` sets the
      delay.
    - A flush and a rebuild reach the viewers 8 at a time, so a change of
      the role tree does not read every window at once.
    - A row removed for rights is `gone`; the link evicts it from Apollo's
      cache, so no other component keeps it.
11. Robustness:
    - A client whose socket buffer holds more than 1 MB loses its pending
      messages and gets the whole window once the buffer drains.
    - A reconnection, a missing revision, a lost listener and a rights
      change all resend the whole window.
    - Closing a connection releases its windows at once, except the
      10 seconds a resume may claim.
12. Live functions: a function with `query: true` whose `use` lists
    `realtime()` is followed too, with no second declaration (amends
    D-109):
    - GraphQL adds a `Subscription` field of the function's name, arguments
      and type; REST answers the function's `GET` route with
      `Accept: text/event-stream` as point 4.
    - The kernel records every read `run` makes, and the reads that shape
      its output, with the fields each returned and the fields that chose
      and ordered its rows. An update wakes the function only when it sets
      one of them; an insert or a delete wakes it when it may enter or
      leave a read. A text search depends on every field.
    - Each message is the whole value with its revision, as a live row. A
      result equal to the last one is not sent.
    - A wake waits 50 ms of quiet, and at most a second after the first
      one; `.with({ realtime: { debounce } })` sets the wait. A wake during
      a run reruns it once after.
    - `run` runs as the subscriber; a rights rebuild reruns it, and a
      different user closes it, as point 10. An error closes the
      subscription with that error, masked unless public (D-28).
    - It counts in `maxSubscriptions`, not in `maxConnectionRows`.
    - A mutation cannot be live: a plugin's types can say
      `queryOnly: true`, which makes `query: true` required in a function
      whose `use` lists it, and `realtimePlugin` refuses one at startup.
13. Tests and merge gate:
    - Every path of points 9 and 10 has a test: ACL removed, role removed,
      member removed through a relation, session revoked, session expired,
      soft delete, a filter field changed, an order field changed, a
      displayed relation changed.
    - A property test runs random writes, rights included, and checks after
      each one that the client's window equals a fresh read as that caller.
    - A benchmark in `bench/` must show, before the merge into `main`, the
      SQL queries per write, the latency from commit to message (p50 and
      p99), the memory per subscription and per connection, and the commit
      rate with and without the feed. It runs with 1 000 and 10 000
      subscribers on one list and on distinct lists, with windows of 25 and
      1 000 rows.

Why:

- A list that resends its whole page on each change costs the page's size
  per write, per subscriber. Changes cost one row, so a window of thousands
  of rows stays cheap for the server and the network.
- The server places each change, with the filter, the order and the rights
  PostgreSQL applies. The client never repeats a filter or a sort, as a
  Parse LiveQuery client's `shouldInsert` and `compare` did, and cannot get
  them wrong.
- The result has the read's type: the front end swaps `query` for
  `subscription` and keeps its components, and codegen types both alike.
- Rights read from the same writes as the data. The kernel already sees
  which models a caller's construction reads, so a role or a session
  change needs no signal from the roles or auth plugins, and no plugin
  must remember to send one.
- `pg_notify` inside the transaction is delivered exactly when the write
  commits: a crash after the commit loses nothing.
- `graphql-ws` and `ws` remove a protocol and a WebSocket server we would
  own (D-92). `@hono/node-ws` requires `@hono/node-server` 1, and the HTTP
  plugin runs 2.

Rejected:

- Re-running the read on each write, or polling it for many callers at once
  (Hasura). Read rules are JavaScript per caller, and polling adds latency.
- Change events the client places itself (Parse LiveQuery): the client
  repeats the filters and the order, and the rights leak when it gets them
  wrong.
- The whole window on each change as the default: it bounds a live list to
  about 100 rows.
- One subscription per page, which shifts its cursor windows and needs merge
  code in the client.
- `@live` queries, which bring Apollo's `fetchMore` back but read the next
  page as a second operation.
- A "rights changed" signal sent by the roles and auth plugins: every plugin
  that narrows reads would owe one.
- Logical replication: it needs `wal_level=logical`, and a replication slot
  whose reader stops fills the disk. The benchmark measures the commit lock
  that `NOTIFY` takes; replication comes back only if that lock costs too
  much.
- Live windows that start after a cursor.

Example:

```tsx
// Before: Parse LiveQuery
const { data, fetchMore, variables } = useQuery(CampaignListDocument, {
	variables: { search: computeSearchInput(searchTerm), filter: role },
})
useListSubscription(CampaignEventsDocument, campaignList, {
	skip: !data,
	context: { queryDeduplication: false },
	listVariables: variables,
	selectEvent: (data) => data.campaignEvents,
	// Repeats the server's filters, and must stay in step with them
	shouldInsert: (campaign) =>
		campaign.viewerInvitationStatus === 'member' &&
		!searchTerm.trim() &&
		(role === 'all' || (role === 'gameMaster') === !!campaign.gameMaster?.isMe),
})
// + createConnectionOnData (420 lines), compare, removeConnectionNode…

// After
export const Campaign = defineModel({ name: 'Campaign', fields, use: [acl(…), realtime()] })

const { data, fetchMore } = useLiveSubscription(CampaignsDocument, {
	variables: { where: campaignWhere(role, searchTerm), first: 25 },
})
<LoadMoreButton
	hasNextPage={data?.campaigns.pageInfo.hasNextPage}
	onClick={() => fetchMore({ first: 25 })}
/>

// A live row
const { data } = useLiveSubscription(CampaignDocument, { variables: { where: { id } } })
// data.campaign: the campaign, or null once it is deleted or unreadable
```

## D-155: The documentation website and the landing page

Amended 2026-10-29: the quickstart includes the starter's template.
Amended 2026-10-30: a page on writing a database adapter.
Amended 2026-10-30: the option check reads the examples a page includes.
Amended 2026-10-30: the clients stay in the realtime page; a README links
to its page.
Amended 2026-10-30: a page's first snippet shows its imports.
Amended 2026-10-30: the landing page's sections, colors and typeface.
Amended 2026-10-30: the landing page shows regions of several examples,
each linking to its file.
Amended 2026-10-30: Cloudflare serves the site at ultimabase.dev.

Choice: completes D-31; the examples stay its source of truth.

1. One site in `website/`, a private workspace: Fumadocs (`fumadocs-core`,
   `fumadocs-ui`, `fumadocs-mdx`) on Next.js, exported as static files
   (`output: 'export'`). The landing page is `/`, the documentation
   `/docs`, searched in the browser by Fumadocs' own index. Cloudflare
   serves it at `https://ultimabase.dev`, a domain registered there, and
   each package's `homepage` is its page. English only.
2. No code is written in a page. Every code block, the landing page's
   included, is a region of an example (D-131), marked `//#region <name>`
   and `//#endregion` in its file and included with
   `<include cwd>../examples/<example>/src/<file>#<name></include>`, a path
   from `website/`, where the site is built. A request
   and its response come from the example's test. Pages write only `bash`
   blocks, for the commands a developer types. A repository test, in
   `yarn validate`, refuses any other fenced block and an include whose file
   or region does not exist. The quickstart also includes the starter's
   template, whole files of `../packages/create-ultimabase/template/`, the
   code `npm create ultimabase` writes, which `yarn validate` type-checks
   and tests as it does an example (amended 2026-10-29).
   A page's first include starts above its file's imports, so it shows
   every import the file holds, and the page links to its example's
   directory on GitHub; the same test checks both (amended 2026-10-30).
3. Every value a package exports, from each entry point but `./internal`,
   appears in a region that a page includes, so an example shows each one.
   The same repository test lists those missing; while the pages are
   written, it holds that list, which only shrinks and is empty before the
   site reaches `main`. Examples are added where
   the existing ones fall short, first `files` (on `memoryFiles()`) and
   `realtime` with its live client (`@ultimabase/live`, its Apollo link and
   its React hook), each as D-131 says.
4. The pages, after the documentation of Better Auth, Convex and Prisma,
   take a developer from nothing to a running application with the
   quickstart, then to every feature from the sidebar or the search:
   - Get started: introduction, quickstart (`npm create ultimabase`), an
     application's files;
   - Concepts: models and fields, relations, queries, access rules, hooks,
     functions, transactions, errors, testing;
   - Plugins: one page each for auth, password, roles, ACL, soft delete,
     files and realtime;
   - Transports: HTTP, GraphQL, REST;
   - Databases: `memory()`, PostgreSQL and its migrations;
   - Deploy: `ultimabase start` and `migrate deploy`;
   - Clients: the live client, its Apollo link and its React hook, in the
     realtime page rather than a section of their own (amended 2026-10-30);
   - Write a plugin: `definePlugin`, its hooks, field types and API.
   - Write a database adapter: the adapter contract (D-73) and
     `testAdapter`, its suite (D-94) (amended 2026-10-30).

   Each page is clear before it is complete, and complete: it opens with
   what its subject is for and its smallest example, then each case a
   developer meets, and ends with a reference of every option, its type,
   default and effect, every error code it can return, and its limits. A
   developer should never need the sources to finish a task.
   The repository test also checks, through the compiler's API, that each
   first-level option of an exported function's `options` or `definition`
   parameter appears as a key in an example a page includes; the audit
   before publication checks the others, as a plugin's `with` (amended
   2026-10-30).

5. For agents: `/llms.txt` lists the pages, `/llms-full.txt` holds them all,
   and each page is also served as Markdown at `/docs/<page>.md`, built by
   Fumadocs from the same pages.
6. The landing page is written in TSX: `website/app/page.tsx` assembles
   its sections from `website/components/landing/`; the documentation
   stays in MDX. Its code blocks are regions of the examples, read when the
   site builds by its `Example` component, which fails the build on a
   missing region and titles each block with a link to its file on GitHub;
   the repository test checks each region as it does a page's include. In
   order, it shows: the product in a sentence, with `npm create ultimabase`
   and links to the documentation and the repository, beside an
   application as its models plus its plugins, above a model, its rule,
   its reads over GraphQL, REST and server code, and a refused write, from
   `examples/introduction`; a statement linking to the sections below; the
   official plugins, each linking to its page, beside the application that
   lists them, in memory and on PostgreSQL; sign-in and access rules;
   fields, relations and queries; transactions; soft delete, writing a
   plugin, realtime, hooks and files; the questions a developer asks first,
   what is not there yet included; and the quickstart. Each section shows
   a region and the result its test checks. The site, the documentation
   included, wears the logo's colors, the accent `#2F5BFF` on the ink
   `#0E1116` and the paper `#F4F4F1`, and the Geist typeface, from the
   `geist` package; the favicon is the logo's app icon (amended
   2026-10-30).
7. Each package gets a README of a few lines: what it does and a link to
   its page on `https://ultimabase.dev/docs`, without code; the repository
   test checks the page exists (amended 2026-10-30).
8. The documentation is versioned by minor version. `/docs` shows the
   latest published one, `/docs/<version>` each one, `/docs/next` the
   pages of `main`, and a menu switches between them. The pages of `main`
   live in `website/content/docs/`. Publishing a version runs
   `yarn website:freeze`, which copies them to
   `website/content/versions/<version>/` with each include replaced by its
   region's code, so they no longer move with the examples; a patch
   version replaces its minor version's copy. A copy holds no include, and
   the repository test checks it. Until 0.1 is published, the site has
   `next` alone.
9. `yarn website:build` runs in its own CI job, outside `yarn validate`
   (D-06). The site is formatted, linted and type-checked with the
   repository; like the examples, it is outside coverage and line budgets.

Why:

- The previous website cost a lot to keep in sync (D-31): its code blocks
  were written in the pages. A block included from an example compiles in
  `yarn typecheck` and runs in its test, so a page cannot show code that
  does not work.
- The maintainer prefers Fumadocs' look. A static export keeps it without a
  server, so the host is a choice made at publication, not now.
- UltimaBase is a small kernel and its plugins, as Better Auth is: one page
  per plugin, and one on writing a plugin, since the community's plugins
  are the product.
- A developer on 0.1 reads 0.1's pages after 0.2 ships; a frozen copy
  keeps them as they were, whatever the examples become.
- The landing page opens on one example from the model to its requests, so
  a reader sees one rule hold everywhere, then shows each capability with
  the example that tests it; the previous landing page's code was written
  in it and no longer matched the API.
- The `geist` package ships the typeface's files, which Next serves from
  the site: no font to host by hand, and a build that needs no network.

Rejected:

- Astro Starlight or VitePress: less work, but not the look the maintainer
  wants.
- The landing page in MDX: it is a page of layout more than text, and its
  components would lose their types in it.
- Twoslash in 0.1: an included region lacks its file's imports, and the
  examples already type-check.
- Snippets checked by a compile step, or blocks marked unverified, as the
  previous base allowed: one rule, every block from an example, leaves
  nothing to classify.
- A reference generated from the types: the editor already shows them.
- Old versions built from their Git tags: each build would check out
  every tag, and a host's shallow clone has none.
- One copy per patch version: a patch changes no API.
- The typeface from Google Fonts at build: each build would need the
  network.

Example:

````mdx
{/* Before: a page wrote its code, which stopped working when the API moved */}

```ts
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ tags: f.many(() => Tag) }),
})
```

{/* After: website/content/docs/relations.mdx */}

<include cwd>../examples/relations/src/models.ts#many-to-many</include>
````

```ts
// examples/relations/src/models.ts
//#region many-to-many
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ tags: f.many(() => Tag) }),
})
//#endregion
```

```text
website/content/docs/relations.mdx: a `ts` block is written in the page;
include it from an example.
website/content/docs/hooks.mdx: examples/functions-and-hooks/src/models.ts
has no region `before-create`.
```

```text
// Versions, once 0.2 is published
website/content/docs/relations.mdx           /docs/next/relations   (main)
website/content/versions/0.2/relations.mdx   /docs/relations        (latest)
website/content/versions/0.1/relations.mdx   /docs/0.1/relations
```

## D-156: Releases from CI: canaries, a release pull request, one tag

Amended by D-157.

Choice: completes D-60; nothing is published from a laptop.

1. Every push to `main` runs `ci.yml`. Once each of its checks passes, two
   jobs of that same file publish, in the GitHub environment `npm`, which
   only `main` may use: npm trusts one workflow file and one environment
   per package, with its OIDC token (trusted publishing), so no npm token
   exists. npm signs each version's provenance.
2. Canary: while changesets are pending, the push publishes every package
   at the next version with the suffix `-canary.<UTC datetime>`, under the
   npm tag `canary`: `0.1.2-canary.20261030141200`.
   `npm create ultimabase@canary` writes a starter on them.
3. Release: while changesets are pending, `changesets/action` opens or
   updates the pull request `chore(release): version packages`, which
   bumps the versions, writes the changelogs, updates the lockfile and
   freezes the documentation (`yarn website:freeze`, D-155). Merging it is
   the one step a release takes: its push publishes each version npm lacks
   under `latest`, then creates the tag `v<version>` and its GitHub release,
   one for all the packages. The release's notes are the changelogs'
   entries, each once after the packages that list it; a version without
   any entry fails. Cloudflare deploys the site from the same push.
4. `scripts/release.ts` packs each package with Yarn, which writes
   `workspace:*` out and applies `publishConfig`, and publishes the pack
   with npm, which alone authenticates with OIDC. It is safe to rerun: a
   version npm has is skipped, a failed publish is tried three times, a
   release GitHub has is kept. A run of `main` is never cancelled, and the
   publishing jobs install without the Yarn cache.
5. Commit messages follow Conventional Commits: a type among `feat`,
   `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
   `revert` and `style`, `!` for a breaking change, and a scope among the
   package directories, `bench`, `ci`, `docs`, `examples`, `release`,
   `repo` and `website`. commitlint checks them in a `commit-msg` hook
   husky installs on `yarn install`, and in CI on the commits a push or a
   pull request brings, which publishing does not wait for: a pushed
   commit cannot be reworded. The message tells contributors what changed;
   the changeset tells users, and decides the version.

Why:

- Publishing 0.1.0 and 0.1.1 took a pack and an `npm publish` per package
  from a laptop, each with its own two-factor prompt.
- Prisma and tRPC publish a canary on every push to `main`, Next.js every
  day; Next.js, Prisma and tRPC create one `v<version>` tag per version.
  Astro, SvelteKit and Keystone release by merging Changesets' pull request.
  All eight publish with OIDC.
- None of them waits for its tests before publishing: they rely on pull
  requests' checks. `main` here takes direct pushes, so the publishing jobs
  wait for every check of the commit.
- A pull request opened with the workflow's token runs no checks; the push
  of its merge does, before anything is published.
- Yarn 4 does not publish with OIDC, and `changeset publish` would create a
  tag and a release per package: 15 for one version.

Rejected:

- pkg.pr.new previews instead of npm canaries: `npm create ultimabase@canary`
  needs the packages on npm, and the service needs a GitHub app.
- release-please, versions derived from commit messages: no snapshot
  versions, one tag per package in a monorepo, and the changelog would be
  written for contributors rather than users.
- An approval on the `npm` environment: merging the release pull request is
  already the decision, made by the only maintainer.
- A commit check written in the repository: commitlint covers the whole
  specification and names the rule a message breaks.
- The release candidates of a large version (`0.2.0-rc.0`) are not built
  until one is prepared, with Changesets' pre mode.

Example:

```text
# Before: the maintainer, for each of the 15 packages
yarn workspace @ultimabase/graphql pack -o packs/%s-%v.tgz
npm publish packs/@ultimabase/graphql-0.1.1.tgz --access public  # 2FA

# After: a fix and its changeset
git commit -m "fix(graphql): a refused query answers BAD_USER_INPUT"
#   → npm: @ultimabase/graphql@0.1.2-canary.20261030141200 (canary)
#   → GitHub: "chore(release): version packages" updated
# Merging that pull request
#   → npm: the 15 packages at 0.1.2 (latest), with provenance
#   → GitHub: tag v0.1.2, release v0.1.2
```

```text
$ git commit -m "release: 0.1.2"
✖   type must be one of [build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test] [type-enum]
```

## D-157: Canaries on demand

Choice: amends D-156 point 2.

1. A push to `main` publishes no canary. "Run workflow" on `ci.yml`, for
   `main`, runs every check, then publishes the pending changesets as a
   canary, as D-156 point 2 describes. The release job runs on pushes
   only.
2. Asked for without a pending changeset, the canary fails: a green run
   publishes something.

Why:

- Each canary is 15 versions npm keeps for good: one per push would fill
  each package's version list with canaries nobody installs.
- A canary serves to try a fix in an application before its release; the
  maintainer knows when one is needed.
- The environment `npm` stays limited to `main` (D-156 point 1): a canary
  publishes reviewed code only.

Rejected:

- No canary at all: a fix would wait for a release to be tried.
- A canary from any branch: it would open the environment `npm`, and
  npm's trust, to unreviewed code.

Example:

```text
# Before: every push with a pending changeset
git push   # → npm: 15 packages at 0.1.2-canary.20261030145550 (canary)

# After
git push   # → checks, the release pull request updated; nothing on npm
# GitHub → Actions → CI → Run workflow (main)
#   → npm: 15 packages at 0.1.2-canary.<UTC datetime> (canary)
npm install ultimabase@canary
```

## D-158: The repository's README

Choice: completes D-155.

1. `README.md` is the repository's front page on GitHub, in English, and
   in this order:
   - the app icon, `website/app/icon.svg`, which reads on GitHub's light
     and dark themes alike;
   - the name, the landing page's product sentence and its lede;
   - four badges: the npm version, the CI of `main`, the license and the
     Node.js versions;
   - links to the documentation, the quickstart, the examples and the
     releases;
   - the pre-release status;
   - `npm create ultimabase@latest`;
   - the introduction's example, from its model to its reads;
   - what UltimaBase does, each line linking to its page;
   - the packages, each linking to its page;
   - how it compares to Parse Server and Supabase;
   - contributing, and the license.
2. Its code blocks are regions of the examples, as a page's are (D-155
   point 2), copied: GitHub includes no file. An HTML comment above each
   block names its region, `<!-- examples/introduction/src/models.ts#post -->`.
   A repository test, in `yarn validate`, refuses a block other than
   `bash` without that comment, and a block that differs from its region.
3. A package's README stays a few lines without code (D-155 point 7).

Why:

- A visitor of the repository decides in its first screen. Hono, tRPC,
  Drizzle and Prisma open on a logo, a sentence, badges and code that runs.
- A copied block drifts from the API unless something checks it, and the
  README is the page a visitor reads first.

Rejected:

- No code in the README, only a link to the site: the code is what shows
  the product.
- A script that writes the README's blocks from the examples: the test
  names the block that drifted, and the fix is a copy.
- A logo with its name, for each theme: an SVG on GitHub renders its text
  in a fallback font, so the name would need its outlines; the name is the
  title below the icon.

Example:

````markdown
<!-- examples/introduction/src/models.ts#post -->

```ts
import { defineModel } from 'ultimabase'
…
```
````

```text
README.md: the block under examples/introduction/src/models.ts#post
differs from its region
```

## D-159: A `one` relation read through `include` or `select` may be `null`

Choice: amends D-86 and D-17 on the result's type.

1. A `one` relation in an `include` or a `select` is typed
   `Target | null`, required or optional, for every caller. At run time it
   reads `null` when its target is absent for the caller: a read rule hides
   it (D-86 point 4), or it is soft-deleted (D-17), which Master does not
   see either.
2. `optional` keeps its meaning, which is the stored key: a required
   relation's key is never empty. `create` needs it, and neither
   `disconnect` nor `onDelete: 'setNull'` empties it (D-54). A required
   relation reads `null` only when its target is absent for the caller.

Why:

- The type said a required `one` is always there, and a read returned
  `null` where it was not: `message.author.name` compiled, then threw once
  the author was hidden or in the trash.
- The GraphQL schema already types every `one` relation as nullable, for the
  same reason (D-107); the TypeScript types now say the same.
- Changing the type touched six lines of the packages' tests, five of the
  relations example, the typing benchmark's expected types, and no
  production code.

Limit: Master writes a null check on a target that no read rule hides and
that has no soft delete, as the relations example's five lines do. A type that depends on the caller and on the
target's plugins would remove it, at a cost to every query's type, which no
use asks for yet.

Rejected:

- Nullable only when the target may hide rows: a model's rules are given to
  `.with()`, which returns the model's type unchanged, so the type does not
  know them; and a model without a read rule is closed to every caller but
  Master.
- Non-null for Master: Master reads `null` for a soft-deleted target.
- Leaving out the row whose required target is absent: a message would
  leave the list with its author, which changes counts and pages and tells
  the caller that a hidden row exists (D-86).

Example:

```ts
const messages = await Message.findMany(
	{ include: { author: true } },
	{ as: caller },
)
// Before: compiled, then threw when the author was hidden or deleted
messages[0].author.name
// After
messages[0].author?.name ?? 'Deleted account'
```

## D-160: Closing an account

Replaced by D-211.

Choice: completes D-112 and D-113, and amends D-113 point 12.

1. auth adds the command `User.closeAccount({ id }, options)`. It closes
   the account and keeps the user's row: a `User.delete` whose row stays,
   so a list of members still shows it. It runs as Master or as that user,
   and refuses any other caller with `ACCESS_DENIED`, "User.closeAccount
   runs as Master or as the user.", as `User.revokeSessions` does (D-113
   point 4). It is a command of server code only: no GraphQL or REST
   function.
2. In one transaction, it ends every session of the user, so their viewers
   and live streams close (D-154), unlinks every account, so their subjects
   are free again, and runs the listeners of the sign-in methods. Once the
   transaction commits, it ends the user's sessions again: a sign-in that
   read the account before it was unlinked may have opened its session
   since, as `setPassword` does (D-113).
3. `AuthApi.onCloseAccount(listener)` registers a method's listener, called
   with the user's id after the accounts are unlinked, in the order the
   methods registered them. A listener that throws rolls the whole close
   back. password registers one in its `api`: it deletes the user's
   `PasswordHash`, `PasswordToken` rows and email requests, as when the
   user is deleted, and sets `emailVerified` to `false` when it was `true`.
4. An unknown id, or an account closed already, closes nothing and is no
   error, as `revokeSessions`.
5. It leaves the row's own fields and the user's roles as they are: the
   application anonymizes the row, in the same transaction when it wants
   one (D-36).
6. Unlinking one account stays out (D-113 point 12): closing unlinks them
   all.

Why:

- An application migrating from Parse closes accounts and keeps the rows,
  so that messages and lists of members still show their author. With
  `revokeSessions` and an update, the email stays linked, so a reset opens
  the account again and `signUp` with that email is a `UNIQUE_VIOLATION`,
  and the hash and the tokens stay; only auth unlinks (D-113) and only
  password writes its tables (D-110).
- The listener lets each method delete what it keeps without auth knowing
  its models, as a community method needs.
- A user deleted with `onDelete: 'setNull'` would also free the email, but
  removes the row a list of members shows.

Rejected:

- A listener on each unlink: an email change unlinks then links, and would
  delete the password.
- A public `unlinkAccount` now: no second method needs it yet.
- Anonymizing in `closeAccount`: which fields an application blanks is its
  own choice.
- A GraphQL and REST function: an application closes an account in its
  own function, where it anonymizes the row and checks what it needs.

Example:

```ts
// Before: the email stays linked, so nobody can sign up with it again,
// and the hash stays in PasswordHash
run: async ({ caller }) => {
	await User.revokeSessions({ id: caller.user.id }, { as: caller })
	await User.update(
		{ where: { id: caller.user.id }, data: { name: 'Deleted account' } },
		{ as: master },
	)
}
// After
run: async ({ caller }) =>
	transaction(async () => {
		await User.closeAccount({ id: caller.user.id }, { as: caller })
		await User.update(
			{ where: { id: caller.user.id }, data: { name: 'Deleted account' } },
			{ as: master },
		)
	})
```

A method that keeps rows of its own deletes them:

```ts
api: ({ plugins }) => {
	plugins.auth.onCloseAccount(async (userId) => {
		await MagicLink.deleteMany({ where: { userId } }, { as: master })
	})
}
```

## D-161: Checking the current password

Choice: completes D-113 and amends D-113 and D-114.

1. `User.checkPassword({ id, password }, { as, client })` checks the user's
   current password before a sensitive action. It opens no session and
   returns nothing; a stale hash is rehashed, as on a sign-in.
2. It runs as Master or as the user; anyone else gets `ACCESS_DENIED`,
   `User.checkPassword runs as Master or as the user.`, as for
   `User.setPassword`.
3. A wrong password, a user without one and an unknown id give
   `INVALID_CREDENTIALS`, `Wrong password.` `changePassword`'s wrong
   current password gives the same message: both know the user, so neither
   names an email. A sign-in keeps `Wrong email or password.`
4. It is always counted, on the user's id, the subject `changePassword`
   counts on:
   - with a `client`, as `changePassword`: 10 failures per address, 100
     per user, 100 per address, in 15 minutes;
   - without one, the 11th failure on the user within 15 minutes, from
     anywhere, `changePassword`'s included, is refused with
     `TOO_MANY_ATTEMPTS`. It is stored under the address `'server'`, which
     no client has, and fills no address's ceiling.
5. It is a command only: no GraphQL or REST function.
6. `User.signIn` without a client stays uncounted (D-113).

Why:

- An application asks the password again before closing an account or
  changing an email, so a stolen session is not enough. The check existed
  inside `changePassword` only; the workaround, `User.signIn`, opened a
  session nothing ended, needed the email, and was never counted without a
  client.
- The check guards an action, so forgetting the `client` must not open it
  to brute force: it is counted per user either way.
- One subject for both commands: alternating between them gives no more
  tries.
- Server attempts under `''` would share the ceiling of every client whose
  transport has no address: failures on many users would lock them all.

Rejected:

- `verifyPassword`: `verifyEmail` already means confirming with a token.
- A public `checkPassword` function: a client could skip it and call the
  action; the action checks the password itself.
- Returning `false` for a wrong password: a forgotten `if` would let the
  action through.
- Keeping `Wrong email or password.` for these checks: no email is typed.

Example, before:

```ts
const deleteAccount = defineFunction({
	name: 'deleteAccount',
	input: z.object({ password: z.string() }),
	run: async ({ input, caller }) => {
		// The application keeps its own copy of the email; this opens a
		// second session, and server code is never counted.
		await User.signIn({ email: caller.user.email, password: input.password })
		await User.closeAccount({ id: caller.user.id }, { as: caller })
	},
})
```

After:

```ts
const deleteAccount = defineFunction({
	name: 'deleteAccount',
	input: z.object({ password: z.string() }),
	run: async ({ input, caller, client }) => {
		await User.checkPassword(
			{ id: caller.user.id, password: input.password },
			{ as: caller, client },
		)
		await User.closeAccount({ id: caller.user.id }, { as: caller })
	},
})
```

## D-162: The stored email and the email change

Amended by D-211.

Choice: completes D-113 and D-117, and amends D-113 point 5, D-117 points 1
and 5, and D-160.

1. `password()` adds `email: string | null` to the user model, unique, `null`
   for a user without a password account. The user itself and Master read
   it; it is left out for any other caller (D-44). Only Master writes it.
2. `User.email` is the password account's subject, whichever path writes it.
   password's hooks keep the account in step, in the write's transaction:
   - a create with an email links the account; `signUp` creates the user
     with its email, then its hash;
   - an update to another email unlinks the account and links the new one.
     It sets `emailVerified` to `false` unless the same write sets it, and
     deletes the pending reset and verification tokens;
   - the email is normalized as at sign-up; an invalid one fails with
     `VALIDATION_FAILED`, a taken one with `UNIQUE_VIOLATION`, and nothing
     is written;
   - `null` is refused while the account is linked, with
     `email: closeAccount removes the email.`; `closeAccount` sets it to
     `null` once the account is unlinked;
   - writing an email on a user without a password links an account without
     a hash: the user sets a password with a reset, which proves the inbox.
     An update to the same email as the account changes nothing else, so
     filling the field from the accounts keeps `emailVerified`.
3. `AuthApi.unlinkAccount(userId, method)` unlinks one account; an account
   that is not linked is no error. It is for the sign-in methods only.
4. With `sendEmail`, two functions:
   - `requestEmailChange(input: { newEmail, currentPassword })` needs a
     signed-in user (`UNAUTHENTICATED`, `requestEmailChange needs a
signed-in user.`). It checks the current password as `changePassword`
     does, counted with it. An email that has an account, the user's own
     included, fails with `UNIQUE_VIOLATION`, `This email has an account.`
     It sends an `'emailChange'` link to the new email, valid one hour; a new
     request replaces the older link. The email counts in the account's
     three per hour.
   - `confirmEmailChange(input: { token })` is public: the link is the
     proof. In one transaction it redeems the token and writes the email
     and `emailVerified: true`, as point 2 says. An email taken meanwhile
     fails with `UNIQUE_VIOLATION`, and the link still works until it
     expires. It opens no session and ends none: the password did not
     change.
     Each returns `true`.
5. When the email changes from one address to another, by either path, the
   old address receives `{ kind: 'emailChanged', to, newEmail, userId }`
   once the write commits, with no token, if the application gives
   `sendEmail`. It is not counted in the account's three emails.
6. `Email` becomes a union: the kinds `'reset'`, `'verify'` and
   `'emailChange'` carry a `token`; `'emailChanged'` carries `newEmail`
   instead. `PasswordToken` stores the address its email went to.
7. A user model that declares its own `email` field stops startup:
   `User.email: password adds a field User already has.` Users stored before
   this decision read `email: null` until a Master update writes their
   account's email.

Why: an application could not change an email, and kept its own copy of
the address to show it. Writing the field is the change itself, so an
application without emails, or with its own proof such as a code by SMS,
changes it with one `User.update`; the functions are the proof for those
that send emails. One path keeps the field and the account from drifting
apart. Telling the old address is OWASP ASVS V2.2.3: a stolen session and
password must not move the account silently. One hour, as a reset: the
user typed the password moments before.
Rejected:

- a public `AuthApi.relinkAccount`: unlink then link, in a transaction, is
  the same;
- the email only on `AuthAccount`, read through `subjectOf`: a rule and a
  client cannot read it;
- refusing Master's writes of `email`: an administrator's change is a real
  need, and refusing would need the kernel to tell password's writes apart;
- a link to undo the change in the notice: nobody asks for it yet;
- ending the sessions on a change: the password, which they prove, did not
  change;
- telling a taken new email apart from a free one in silence: `signUp`
  already tells it (D-115), and the caller proved the password.

Example, before:

```ts
// Impossible: the account kept the old address.
await User.update({ where: { id }, data: { contactEmail: newEmail } }, M)
```

After:

```ts
// From server code, with or without emails
await User.update({ where: { id }, data: { email: 'ada@new.example' } }, M)

// From a client, with sendEmail
requestEmailChange(input: { newEmail: "ada@new.example", currentPassword: "correct horse" })
confirmEmailChange(input: { token })

// The application's sendEmail
sendEmail: async (email) => {
	if (email.kind === 'emailChanged') return notice(email.to, email.newEmail)
	return link(email.kind, email.to, email.token)
}
```

## D-163: A viewer tells when it closes

Choice: amends D-154.

1. `Viewer.onClose(listener: () => void): void` adds a listener that runs
   once, when the viewer closes, whatever closes it: its caller ended (a
   sign-out, a password change, a closed account, a session expired), the
   application stops, or `close()` was called.
2. A listener added to a closed viewer runs at once.
3. A listener that throws is logged with the application's logger; the
   other listeners still run, and the viewer is closed all the same.
4. No reason is given, a listener is not removed, and there is no listener
   for a caller that changes.
5. The realtime page shows a plugin's own WebSocket: it connects a viewer,
   closes the socket in `onClose`, and closes the viewer when the socket
   closes.

Before, a plugin's socket without a live read learns of nothing, so it
polls `closed`:

```ts
const viewer = await plugins.realtime.connect(upgrade.request)
const timer = setInterval(() => {
	if (viewer.closed) socket.close()
}, 5000)
```

After:

```ts
const viewer = await plugins.realtime.connect(upgrade.request)
viewer.onClose(() => socket.close())
socket.on('close', () => viewer.close())
```

Why:

- GraphQL and REST learn of a closed viewer through the `closed` message
  of their live reads. A plugin's socket that holds none, such as one that
  only sends notifications, keeps serving a caller who signed out.
- A listener that runs at once on a closed viewer leaves no gap between
  `connect` and `onClose`.

Rejected:

- `realtime.connect(request, { onClose })`: a listener is added where the
  socket is known, often after `connect`, and a plugin may add several.
- A reason, an unsubscribe and `onCallerChange`: no plugin needs them yet.

## D-164: auth warns without a sign-in method

Choice: amends D-16 and D-112.

1. A plugin's context gets `dependents`: the names of the plugins whose
   `requires` lists it. A plugin's `optional` does not count.
2. auth's `start` logs a warning when its `dependents` is empty:
   `authPlugin() has no sign-in method: add one, as passwordPlugin().`
   The application still starts.
3. A plugin that requires auth without being a sign-in method silences the
   warning; no plugin declares itself a sign-in method.

Why:

- auth declares no way to sign in (D-112): an application with auth and no
  sign-in plugin starts and serves `viewer` and `signOut`, and every request
  is anonymous. Nothing says so, and the cause is one forgotten plugin.
- The kernel already knows each plugin's requirements. It gives the fact;
  auth decides what it means, so the kernel names no plugin.
- A warning, not an error: an application that only reads sessions, or a
  test, may run without a sign-in method.

Rejected:

- An error at start: it refuses those applications.
- The list of every installed plugin in the context: wider than the need.
- A sign-in method that declares itself to auth: a custom one that forgets
  would raise a false warning, and it is one more call for each method.

Before:

```ts
defineApp({
	database: memory(),
	plugins: [httpPlugin(), graphqlPlugin(), authPlugin()],
	models: [User],
})
// starts silently; signIn does not exist and nobody signs in
```

After:

```text
20:11:27 WARN  [auth] authPlugin() has no sign-in method: add one, as passwordPlugin().
```

A plugin reads its dependents:

```ts
start: ({ dependents, logger }) => {
	if (dependents.length > 0) return
	logger.warn('authPlugin() has no sign-in method: add one, as passwordPlugin().')
},
```

## D-165: Session durations

Choice: amends D-112 point 5 and D-115 point 6.

1. `authPlugin({ sessions: { lifetime, longest } })` sets how long a
   session lasts after its last use and at most after its sign-in, in
   milliseconds. Both are optional: 30 and 365 days, as before.
2. A session used with less than half its lifetime left is renewed, never
   past the longest after its sign-in. There is no `renewal` option.
3. At start, a duration that is not a finite positive number is refused with
   `authPlugin() sessions: lifetime and longest are positive numbers of
milliseconds.`, and a lifetime longer than the longest with
   `authPlugin() sessions: lifetime is longer than longest.`
4. The session cookie's `Max-Age` is the longest, in whole seconds rounded
   up, and 400 days at most, the browsers' limit: 365 days by default
   instead of 400.
5. New durations apply to the sessions opened or renewed after the start; a
   session already open keeps its end. `User.revokeSessions` ends the
   others at once.

Why:

- An application coming from Parse configured its sessions
  (`sessionLength`, `expireInactiveSessions`); a back office or a shared
  computer wants shorter ones without patching the framework.
- Milliseconds are the unit of `Date` and `setTimeout`, and need no parser.
- A renewal at half the lifetime keeps D-115's 15 of 30 days, and leaves
  one rule to check instead of two.
- A cookie that outlives every session it can hold stays on a shared
  computer for nothing.

Rejected:

- Durations as `'8h'` or `{ hours: 8 }`: a parser or a type more, for one
  option.
- A `renewal` option: no application asks for it, and it adds the rule
  `renewal < lifetime`.
- Ending a session past the new longest at each request: it covers
  `longest` only, since the last use is not stored.
- A cookie that ends with the browser, for a sign-in without "remember me":
  nobody asks for it yet.

Example, before:

```ts
// Sessions last 30 days after their last use, whatever the application.
authPlugin()
```

After:

```ts
const hour = 60 * 60 * 1000

// A back office: a session ends 8 hours after its last use, and 7 days at
// most after the sign-in.
authPlugin({ sessions: { lifetime: 8 * hour, longest: 7 * 24 * hour } })
```

## D-166: Refusing and closing WebSockets

Amended by D-205.

Choice: amends D-106 and D-154 point 5 (`upgrade(path, accept)`).

1. `httpPlugin({ upgrade })` takes a gate,
   `(request: Request) => Response | undefined | Promise<Response | undefined>`.
   It runs on each WebSocket upgrade after the URL, path and origin checks
   and before the plugin that takes the path. A `Response` is sent as it is,
   status, headers and body, then the socket closes; `undefined` lets the
   upgrade through. It reads no caller: `identify` has not run.
2. A gate that throws is logged and answered 500 `INTERNAL`, as a plugin
   that throws on an upgrade. A socket waiting on the gate is one `stop`
   waits for.
3. `http.upgrade(path, accept, { close })` takes, besides `accept`, how the
   plugin closes its sockets on that path: `close(code, reason)`.
4. `http.closeUpgrades({ code, reason, path })` closes the sockets open on
   every path, or on `path` alone. It calls each path's `close`; the sockets
   of a path without one are destroyed, which a client reads as 1006.
   `reason` is `''` by default. It returns once each `close` is called, not
   once the sockets are closed.
5. `closeUpgrades` with a `path` no plugin takes throws
   `No plugin takes the upgrades of ${path}.`; before the start, or after
   the stop, it closes nothing.
6. graphql's `close` closes each of its sockets with the code and reason.
   `stop` still closes them with 1001.

Why:

- An application coming from Parse refuses new sockets during maintenance
  with 503 and closes the open ones with 1012 (Service Restart): a
  graphql-ws client then retries, meets the 503 and stops. Neither was
  possible: `use` middlewares do not run on upgrades, and graphql's sockets
  are its own.
- The close code is the WebSocket protocol's, which only the plugin that
  took the socket speaks: http holds the raw stream, and can only cut it.
- A gate that returns a `Response` is the shape of every other HTTP answer
  in the application, and lets it send `Retry-After`.
- The gate is the application's, not each plugin's: maintenance refuses
  every socket, as `use` refuses every request.

Rejected:

- Running the `use` middlewares on upgrades: they read the caller and a
  body, and answer with Hono's context, which an upgrade has neither of.
- Closing from http alone: every client would read 1006, an abnormal
  close, and retry as after a crash.
- A `closeSockets` on graphql only: each plugin that takes a path would add
  its own, and the application would call them all.
- Closing the sockets of one user, as after a ban: nobody asks for it yet,
  and it needs the caller of each socket.

Example, before:

```ts
// Nothing refuses a new GraphQL socket during maintenance, and nothing
// closes those already open.
httpPlugin({ routes: [routes] })
```

After:

```ts
httpPlugin({
	routes: [routes],
	upgrade: () =>
		maintenance.enabled
			? Response.json(
					{ code: 'UNAVAILABLE', message: 'Under maintenance.' },
					{ status: 503 },
				)
			: undefined,
})

// In a plugin that requires http: when maintenance begins, every socket
// open is closed with 1012.
start: ({ plugins }) => {
	maintenance.subscribe((enabled) => {
		if (enabled) plugins.http.closeUpgrades({ code: 1012, reason: 'Maintenance' })
	})
},
```

## D-167: The plugin context's type is public

Choice: completes D-57 and D-89 point 6.

1. `ultimabase` exports `PluginContext<T>`, the context a plugin's `start`,
   `stop`, `api`, `identify`, `caller`, `changed` and `missed` receive, for
   a helper they share.
2. `AppOptions` stays private: `PluginContext<T>['options']` names the
   application options.

Why:

- A plugin's hooks share code, as a cache that `identify`, `changed` and
  `missed` read; without the type, its author restates part of it.

Rejected:

- Exporting `AppOptions` too: a second name for `PluginContext<T>['options']`,
  with a `never` case a plugin author need not read.

Example, before:

```ts
interface LoadContext {
	readonly options: MaintenanceTypes['appOptions']
	readonly logger: Logger
}
const load = ({ options, logger }: LoadContext) => …
```

After:

```ts
import type { PluginContext } from 'ultimabase'

const load = ({ options, logger }: PluginContext<MaintenanceTypes>) => …
```

## D-168: A test calls the plugins' `missed`

Choice: amends D-130 point 2 (`testApplication` returns `{ url }`) and
completes D-154's change feed.

1. `testApplication(app, options?)` returns `feed` beside `url`:
   `running.feed.missed()` calls the `missed` of each plugin that takes the
   feed, in declaration order, as after a lost connection, on any database.
   Without such a plugin it does nothing.
2. It runs during a test; outside one it throws
   `feed.missed() runs during a test.`
3. A change the feed does not report is written with `database.sql` on
   `postgres()`, under `{ database: 'declared' }` (D-137): the feed reports
   the writes of the API only. `memory()` writes none.
4. The kernel gives `testApplication` the running application's feed on
   `ultimabase/internal`; the `Adapter` contract does not change.

Why:

- A plugin that follows the feed, as a cache, a lock or presence, reads
  again in `missed` what it may have lost; an application tests that read
  without ending the feed's connection, its name, its channel and the test
  schema by hand.

Rejected:

- `feed.drop()`, ending the listening connection: the reconnection is
  postgres's own, tested there; an application tests its `missed`.
- Writes the feed does not report, on `memory()` or through the API:
  `postgres()` reports a commit after it, so a window of unreported writes
  would race the notifications; `database.sql` already writes them.

Example, before:

```ts
// Find the feed's connection and the test schema, write, then end it.
const { rows } = await sql.query(
	`select pid, query from pg_stat_activity where application_name = 'ultimabase-feed'`,
)
await sql.query(`update "${schema}".maintenance set enabled = true`)
await sql.query('select pg_terminate_backend($1)', [rows[0].pid])
```

After:

```ts
const running = testApplication(app, { database: 'declared' })

it('reads the lock again after lost changes', async () => {
	await database.sql`update maintenance set enabled = true`
	running.feed.missed()
	// …
})
```

## D-169: When the password was set

Amended by D-211.

Choice: completes D-113, D-117, D-160 and D-162.

1. `password()` adds `passwordSetAt: Date | null` to the user model, `null`
   for a user without a password. The user itself and Master read it; it is
   left out for any other caller (D-44). Only Master writes it, as `email`.
2. password sets it to the time of the write, in the transaction that sets
   the password: `signUp`, `changePassword`, `resetPassword` and
   `User.setPassword`, including a first password for an email without one
   (D-162). A rehash on sign-in (D-113) keeps it: the password is the same.
3. `closeAccount` sets it to `null`, with the email (D-160).
4. The write goes through the user model's queries, so the application's
   hooks on the user run, as for any field.
5. With `sendEmail`, once the write commits, password sends
   `{ kind: 'passwordChanged', to, userId }` to the account's email, without
   a token, as `'emailChanged'` (D-162): after `changePassword`,
   `resetPassword` and `User.setPassword`, Master's included. Not after
   `signUp`, nor `closeAccount`, nor a Master write of `passwordSetAt`
   itself, as when an application migrates from Parse: password tells only
   the writes it made. It is not counted among an account's three emails an
   hour (D-117): the account did not ask for it.
6. `signUp({ fields })` refuses `passwordSetAt`, as `email`. A user model
   that declares its own `passwordSetAt` stops startup:
   `User.passwordSetAt: password adds a field User already has.` Users
   stored before this decision read `null` until their next password; a
   Master write fills it, as when an application migrates from Parse.

Why: an application shows "password last changed on …", and tells the user
their password changed (OWASP ASVS V2.2.3), and could do neither: the hash
holds no date and is not exposed, and the password is not a user field, so
no hook on the user ran. The notice is password's, as the email change's: a
hook that compares `passwordSetAt` would also email every user a Parse
import dates.

Rejected:

- a listener, `password.onPasswordSet(({ userId, reason }) => …)`: a second
  way to react to a write; the field lets a rule, a client and a hook read
  it, and a hook already runs on the user's write;
- a date on `PasswordHash` only: no rule or client reads it;
- sending the notice when `setPassword`'s own transaction ends: a reset, or
  the application, may run it inside a larger one that rolls back;
- refusing Master's writes: an application migrating from Parse copies its
  own date, and refusing would need the kernel to tell password's writes
  apart (D-162).

Example, before:

```ts
// Impossible: no field and no hook tell when the password changed.
```

After:

```ts
const user = await User.findUnique({ where: { id } }, { as: caller })
user.passwordSetAt // Date | null

// The application's sendEmail
if (email.kind === 'passwordChanged') {
	await mail(email.to, 'Your password was changed. Not you? Reset it.')
}
```

## D-170: Case-insensitive unique keys

Choice: amends D-52 and D-140.

1. A `string` field takes `unique: 'insensitive'`:
   `f.string({ unique: 'insensitive' })`. Two rows whose values differ by
   case alone clash; a row may change the case of its own value, `alice` to
   `Alice`. Another field type and a list refuse it, in its type and at
   startup. Its options are the exported `InsensitiveOptions`, the string's
   options whose `unique` is `'insensitive'`; `unique` stays a `boolean` in
   the options every other field and a plugin's field types take.
2. A unique index of `defineModel` takes `mode: 'insensitive'`:
   `indexes: [{ fields: ['team', 'handle'], unique: true, mode: 'insensitive' }]`.
   Its string and enum fields ignore case, its other fields compare as in
   any unique index, and one of its fields at least is a `string`. It is
   refused without `unique: true` and with `contains`. A plugin's index
   (D-122) does not take it: no plugin needs it.
3. Each is a unique target (D-52), matched exactly as any other:
   `findUnique({ where: { username: 'alice' } })` does not find `Alice`;
   `findFirst` with D-140's `mode: 'insensitive'` does. A clash is the
   `UNIQUE_VIOLATION` of D-72, which names the model's fields:
   `fields: ['username']`.
4. The field's option reaches the adapter as an index of its own,
   `{ fields: ['username'], unique: true, mode: 'insensitive' }`; its
   `SchemaField` is not `unique`. `memory()` compares the `toLowerCase()`
   of each string value of such a key.
5. `postgres()` makes a unique index over `lower(column collate "default")`
   for each text column and over the bare column for the others, named
   `<table>_<columns>_lower_key`:
   `create unique index "user_username_lower_key" on "user" (lower("username" collate "default"))`.
   The snapshot keeps these apart, as `lowerUniques`, which a table without
   one leaves out, so the snapshots of 0.2 read and compare unchanged
   (D-105). A migration over rows that already clash fails and names the
   key: `a case-insensitive unique key on User (username) fails when two rows share a value regardless of case`.
6. An insensitive `equals` or `not` on a field of such a key compiles to
   `lower(column collate "default") = lower(value)`, which its index serves.
   `ilike` lowers both sides as `lower()` does, so no result changes. `in`
   keeps D-140's `ilike`s, and the other fields their `ilike`.
7. Under the `C` locale, `lower()` folds ASCII only: `É` and `é` then
   differ in PostgreSQL and clash in `memory()`, as D-140 point 3 warns.

Why:

- A username, a slug or an email is often unique regardless of case, while
  its owner chooses the case. D-140 left that to a `beforeCreate` that
  normalizes the value, which loses that case; an application migrating
  from Parse keeps instead a lowered copy in a hidden field, filled by two
  hooks, optional so that sign-up does not ask for it, and whose
  `UNIQUE_VIOLATION` names a field the client never sent.
- D-140 rejected `caseInsensitive` because every query on the field would
  ignore case. Here only uniqueness does: the value keeps its case, and
  filters keep theirs unless they say `mode`.
- An index on `lower()` is the PostgreSQL way to make such a key, and it
  serves the equality a sign-in by name runs.

Rejected:

- A `citext` column: an extension, and every comparison and sort of the
  field would ignore case.
- A generated lowered column with a unique constraint: a column the models
  do not declare, and a second value to keep in the snapshot.
- `findUnique` ignoring case on such a key: a unique target matches as a
  `where` without `mode` does; `findFirst` already reads it so.
- `unique: { mode: 'insensitive' }` on the field: an object for one
  option, where the index's `mode` already names it.

Example, before:

```ts
export const User = defineModel({
	name: 'User',
	fields: (f) => ({
		username: f.string(),
		usernameKey: f
			.string({ optional: true, unique: true })
			.with({ access: allow.private }),
	}),
}).with({
	hooks: {
		beforeCreate: ({ data }) => {
			data.usernameKey = data.username.toLowerCase()
		},
		beforeUpdate: ({ data }) => {
			if (data.username !== undefined) {
				data.usernameKey = data.username.toLowerCase()
			}
		},
	},
})
// A clash: { code: 'UNIQUE_VIOLATION', details: { model: 'User', fields: ['usernameKey'] } }
```

After:

```ts
export const User = defineModel({
	name: 'User',
	fields: (f) => ({ username: f.string({ unique: 'insensitive' }) }),
})
// A clash: { code: 'UNIQUE_VIOLATION', details: { model: 'User', fields: ['username'] } }
await User.findFirst(
	{ where: { username: { equals: 'ALICE', mode: 'insensitive' } } },
	as,
)
```

```sql
-- The migration `ultimabase migrate create` writes
create unique index "user_username_lower_key" on "user" (lower("username" collate "default"));
```

## D-171: The development commands load the `.env` beside the config

Choice: amends D-105.

1. `ultimabase dev`, `sync`, `reset` and `migrate create` load the `.env`
   file of the directory that holds the config, `ultimabase.config.ts` or the
   file `--config` names, not the working directory's: a monorepo's root
   script and a run from the package read the same file.
2. `start`, `migrate deploy` and `migrate status` never load it: in
   production the host sets the environment, and a `.env` left in the image
   would change it silently.
3. A variable already set wins, as Node's `--env-file` and
   `process.loadEnvFile` keep it: a shell or a CI sets what a `.env` holds
   otherwise.
4. `dev` passes `--env-file=<path>` to the `node --watch` process it starts,
   only when the file exists, so a change to `.env` restarts the application
   as a change to a source file does. `dev` sets `NODE_ENV` to `development`
   before, so a `NODE_ENV` in the `.env` does not apply to it. The other
   commands call `process.loadEnvFile`.
5. A missing file is no error and logs nothing. The usage text says which
   commands load it.

Why:

- An application reads `DATABASE_URL` and `MASTER_KEY` from the
  environment (D-105). Without a `.env`, each project writes
  `node --env-file-if-exists=.env $(yarn bin ultimabase) dev`, and a script
  run from the monorepo's root reads the root's file.
- The config's directory is the project's: the command already finds the
  application there.
- `--env-file-if-exists` logs `.env not found. Continuing without it.` on
  each start without the file; checking first keeps the development log
  quiet.

Rejected:

- A `--env-file <path>` option: no application asks for another file;
  `node --env-file` still names one.
- `.env.local` and `.env.development`: a second file and an order between
  them, for a need nobody has shown.
- A log line naming the file loaded: the variables are the application's
  to report.
- Loading the `.env` for `start`: see point 2.

Example, before:

```json
{
	"scripts": {
		"dev": "node --env-file-if-exists=.env $(yarn bin ultimabase) dev",
		"sync": "node --env-file-if-exists=.env $(yarn bin ultimabase) sync"
	}
}
```

After, with `DATABASE_URL` in `packages/backend/.env`, beside
`packages/backend/ultimabase.config.ts`:

```json
{ "scripts": { "dev": "ultimabase dev", "sync": "ultimabase sync" } }
```

```bash
# From the monorepo's root: the same file is loaded.
yarn workspace backend dev
npx ultimabase sync --config packages/backend/ultimabase.config.ts
```

## D-172: A plugin of the application has no manifest

Choice: amends D-57 and D-95.

1. `manifest` is optional in `definePlugin`. A plugin without one is the
   application's own, written in its source and never published: `start`
   checks no range of it and logs no warning. It keeps its `name` for the
   logs, `requires` and `optional`.
2. A plugin with a manifest is checked as D-95 says, and one whose manifest
   gives `ultimabase` no range still warns: that is a published plugin's
   forgotten field.
3. A plugin without a manifest is no package: another plugin's
   `peerDependencies` cannot name it, as for a peer not installed.
4. A `manifest` that is not an object, `null` included, is refused as
   before.
5. The documentation says `manifest` is optional, and recommends it for
   every published plugin, which passes its imported `package.json`: without
   it, a version conflict fails later, in a hook. A plugin of the application
   is shown without one. The examples' plugins of an application drop
   theirs, except `rpc`, written to be published, which shows a manifest.

Why:

- A plugin in the application is compiled against the kernel the
  application installs: it cannot be out of step, so its range only
  restates `package.json`. Written `^0.2.0`, it refused the canary of 0.3
  and broke every test; written `*`, it checks nothing.
- Its manifest's `name` and `version` are invented, for a package that
  does not exist.

Rejected:

- No warning when `peerDependencies` is absent: it would drop D-95's
  warning for published plugins too, and keep the invented name and
  version.
- Documenting `peerDependencies: { ultimabase: '*' }`: it stays
  boilerplate, and `*` is a range that checks nothing.
- A `local: true` key: a second way to say what the absent manifest says.

Example, before:

```ts
export const { plugin: maintenancePlugin, use: maintenance } =
	definePlugin<Maintenance>({
		name: 'maintenance',
		manifest: {
			name: 'backend-maintenance',
			version: '1.0.0',
			peerDependencies: { ultimabase: '^0.2.0' },
		},
		// ...
	})
// After an upgrade to 0.3:
// Refused: backend-maintenance 1.0.0 needs ultimabase ^0.2.0; this is ultimabase 0.3.0.
```

After:

```ts
export const { plugin: maintenancePlugin, use: maintenance } =
	definePlugin<Maintenance>({
		name: 'maintenance',
		// ...
	})
```

A published plugin keeps its manifest:

```ts
import manifest from '../package.json' with { type: 'json' }

export const { plugin: archivePlugin, use: archive } = definePlugin<Archive>({
	name: 'archive',
	manifest,
	// ...
})
```

## D-173: `yarn validate` runs in 90 seconds at most

Amended by D-210.

Choice: amends D-06. `yarn validate` stays under 90 seconds locally, instead
of one minute. The other budgets of D-06 are unchanged: PostgreSQL tests in a
separate command, file and package line limits.
Why: `yarn validate` takes 72 seconds on the
maintainer's machine (1916 tests, the type check, lint and the docs checks).
Holding one minute would mean dropping checks, which costs more than the
seconds it saves. 90 seconds keeps a margin and keeps a slowdown visible.
Rejected: two minutes (a margin of 48 seconds lets the run drift unseen);
moving tests out of `yarn validate` (it is the one command that proves a
change).

## D-174: An index names the kernel's fields

Choice: amends D-52.

1. A non-unique index of `defineModel` may name `id`, `createdAt` and
   `updatedAt`, the fields the kernel sets (D-22), beside the model's own:
   `indexes: [{ fields: ['room', 'createdAt', 'id'] }]`.
2. A unique index refuses them, in its type and at startup:
   `Message: a unique index cannot name 'createdAt', which the kernel sets.`
   `id` is unique already, and a timestamp the kernel writes makes no key.
3. A `contains` index refuses them as any field that is not a string
   (D-141).
4. `postgres()` reads their columns, `id`, `created_at` and `updated_at`:
   `create index "message_room_created_at_id_idx" on "message" ("room", "created_at", "id")`.

Why: an application migrating from Parse pages a room's newest messages,
`where: { room }` ordered by `createdAt` then `id`. Without an index over
these columns, every page reads and sorts all the room's rows. Parse
indexed `createdAt` by hand in the database; an index made outside the
snapshot is missing from every new database, a test's or another
environment's.

Rejected:

- Allowing them in a unique index: `id` is a key alone, and two rows
  created in the same millisecond would clash.
- Indexing `createdAt` on every model: an index costs each write, and most
  models never sort by it.
- An index made by hand in the database: `sync` compares snapshots and
  never makes it again.

Example, before: refused on the index's line.

```ts
const Message = defineModel({
	name: 'Message',
	fields: (f) => ({ room: f.one(() => Room), text: f.string() }),
	// 'createdAt' is not a scalar field or a one relation of the model
	indexes: [{ fields: ['room', 'createdAt', 'id'] }],
})
```

After: the same model starts, and this read uses the index.

```ts
await Message.findMany(
	{
		where: { room: { id: room.id } },
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		take: 30,
	},
	{ as },
)
```

## D-175: A uuid is an `ID` in GraphQL

Choice: amends D-109.

1. A string of JSON Schema format `uuid`, as `z.uuid()`, `z.uuidv7()` and
   `z.guid()` export it, is GraphQL's `ID`, in a function's input and
   output and in a json field's type (D-125): `input: z.object({ id: z.uuid() })`
   gives `accept(id: ID!)`.
2. OpenAPI keeps the schema's `{ type: 'string', format: 'uuid' }`, as REST
   already exports it (D-144): no change there.
3. The schema still validates the value: an `ID` that is not a uuid, as
   `7`, is `VALIDATION_FAILED`.

Why: a row's `id` is an `ID` in GraphQL (D-22). A client that reads it and
passes it to a function declared it `ID!` for a generated mutation and
`String!` for the function, since `ID!` is refused where `String!` is
expected. Every id the kernel makes is a uuid, so the schema already says
"an id".

Rejected:

- A helper, `idOf(Invitation)`, a branded string naming the model: a new
  export whose only use today is the type name. It could also check that
  the row exists and that the caller reads it; that is a decision of its
  own, when a function needs it.
- Every string named `id`: a name is no type, and an external id, as a
  payment's, is no uuid.

Upgrade: a client that declares `$id: String!` for a `z.uuid()` argument
declares `$id: ID!`.

Example, before:

```graphql
mutation ($id: String!) {
	restorePost(id: $id) {
		title
	}
}
mutation ($id: ID!) {
	deletePost(where: { id: $id }) {
		title
	}
}
```

After, with `input: z.object({ id: z.uuid() })`:

```graphql
mutation ($id: ID!) {
	restorePost(id: $id) {
		title
	}
}
mutation ($id: ID!) {
	deletePost(where: { id: $id }) {
		title
	}
}
```

## D-176: `allow.public` and `allow.readOnly` are no field read rule

Choice: amends D-44.

1. A field whose read rule is `allow.public` or `allow.readOnly`, as in
   `access: allow.readOnly` or `access: { read: allow.public }`, has no read
   rule: every caller reads it, filters on it, sorts on it and aggregates it,
   as a field without `access`.
2. The kernel tells these rules by identity, as D-44 tells `allow.private`:
   only Master reads such a field. A rule of one's own that returns `true`,
   such as `{ read: () => true }`, stays a read rule: the kernel does not run a rule
   to learn what it does.
3. The field is no longer hidden row by row, so GraphQL and OpenAPI type it
   as its field declares it, non-null when it is required, and `search: true`
   is allowed on it (D-148).
4. Writes are unchanged: `allow.readOnly` still refuses a write to the field
   to all but Master, and `{ read: allow.public, write: allow.private }` too.

Why:

- `allow.readOnly` reads "everyone reads, only Master writes", yet a field
  with it was refused in a filter and typed nullable, as one a rule may
  hide. An application migrating from Parse marks a field the server sets,
  such as `featured`, with it, and its clients then cannot list the
  featured rows.
- `allow.public` always returns `true`: the row-by-row check and the refusal
  in filters protect nothing.

Rejected:

- Running a read rule once without a record to learn whether it always
  allows: a rule may read the caller, so its answer for one caller is not
  the answer for another.
- A new helper, such as `allow.serverWrites`: `allow.readOnly` already says
  it.

Example, before: a user's filter on a field only Master writes fails.

```ts
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		featured: f.boolean({ default: false }).with({ access: allow.readOnly }),
	}),
}).with({ access: allow.public })

await Post.findMany({ where: { featured: { equals: true } } }, { as: caller })
// INVALID_QUERY: where.featured: Post.featured has a read rule; only Master
// filters on it.
```

After, with the same model: the filter returns the featured posts, GraphQL
types `featured` as `Boolean!`, and a user's write to it is still refused.

```ts
await Post.findMany({ where: { featured: { equals: true } } }, { as: caller })
await Post.update({ where: { id }, data: { featured: true } }, { as: caller })
// ACCESS_DENIED: Post update refused.
```

## D-177: A test lists the queries a callback makes

Choice: amends D-130.

1. The value `testApplication` returns gains `queries(callback)`. It runs
   the callback and resolves to the list of queries the callback sent to the
   database, in their order. Rows written before the call are not listed.
2. An entry is a string: the operation, `find`, `count`, `aggregate` or
   `write`, then the model it reads, as `'find User'`. A write names the
   models its changes touch, in their order and once each, as
   `'write Invite, User'`.
3. The queries of a transaction are listed; its begin, commit and rollback
   are not. `database.sql` is not listed: it goes to the database without
   the adapter's contract.
4. The entries name no caller and no arguments: the operation and the model
   are what a test of a refusal or of an N+1 checks.
5. The queries are recorded on the adapter itself and on each transaction it
   begins, the same objects, not wrappers: postgres()'s `sql` finds the open
   transaction by them (D-137). It works on `memory()` and on
   `{ database: 'declared' }`.
6. While the callback runs, every query of the application is listed, a
   plugin's included. `queries()` throws outside a test and inside another
   `queries()` callback. A callback that throws stops the recording and
   rejects with its error.

Why:

- A function that refuses its input before it reads anything cannot prove it
  today: the models are frozen, so `vi.spyOn` on them throws, and the kernel
  logs no query. A test that checks only the error code still passes when the
  refusal moves after the read.
- The adapter is where every query of the API passes, so one recording sees
  them all without touching the kernel.
- Strings read at a glance in a failed `toEqual`, and an N+1 shows as a list
  that grows with the rows.

Rejected:

- `app.queries.record()` and `stop()` on the application, as the issue first
  asked: a recording left running past a failed assertion lists the next
  test's queries; a callback ends it.
- The caller of each query: the adapter does not receive it, and a test of a
  rule checks its result.
- A debug log line per query in the kernel: a log level the logger does not
  have (D-58), for a need tests alone have shown.
- A wrapper around the adapter: raw SQL in a transaction would run outside
  it.

Example, before: the test proves the error, not that nothing was read.

```ts
await expect(
	sendInvite.run({ userId: alice.id }, alice.as),
).rejects.toMatchObject({ code: 'CANNOT_INVITE_YOURSELF' })
```

After:

```ts
const running = testApplication(app)

it('refuses an invite to yourself before any query', async () => {
	const queries = await running.queries(async () => {
		await expect(
			sendInvite.run({ userId: alice.id }, alice.as),
		).rejects.toMatchObject({ code: 'CANNOT_INVITE_YOURSELF' })
	})
	expect(queries).toEqual([])
})

it('invites with one read and one write', async () => {
	const queries = await running.queries(() =>
		sendInvite.run({ userId: bob.id }, alice.as),
	)
	expect(queries).toEqual(['find User', 'write Invite'])
})
```

## D-178: A socket's query reads its caller again

Choice: amends D-154, point 5.

1. A query or a mutation sent over the GraphQL socket reads its caller again
   before it runs, with the request the viewer holds, as HTTP reads one per
   request. It runs as that caller, so a change of role, team or claims
   shows at the next operation.
2. When the caller read is another user, or `identify` fails, the viewer
   ends and the socket closes with `4403`, as when a rebuild finds another
   user. The operation gets `Forbidden`.
3. A subscription keeps the viewer's caller: its live reads are rebuilt when
   a write may change it, on the `refresh` timer and at its expiry (D-154).
4. The new caller is not kept on the viewer: the live reads change caller
   only through a rebuild, which also plans them again.

Why:

- A rebuild reaches the viewers 8 at a time, after the flush that triggered
  it, and the timer runs every 5 minutes: under load, or after a change
  outside the database, a query could run as a caller HTTP no longer has.
- Reading the caller costs what it costs over HTTP, once per operation, and
  makes the socket follow the same rules as HTTP without a second model.

Rejected:

- Rebuilding the whole viewer before each query: it plans every live read
  again, which a query does not need.
- Keeping the caller and documenting the delay: the same query would answer
  differently over HTTP and over the socket (D-129).

Example, before: the session's role changes in the database while the
socket stays open, and outside any write a viewer follows.

```ts
await setRole(ada, 'viewer') // in another service
// Over the socket, until the next rebuild, still as an admin:
await client.query({ query: DeleteProject, variables: { id } })
```

After: the same mutation reads Ada's caller again and is refused by her new
role, as over HTTP. Had her session ended, the socket would close with
`4403`.

## D-179: A serializable transaction, retried on conflict

Amended by D-183.

Choice: amends D-66, D-72 and D-73; D-99 still rejects serializable
isolation by default.

1. `transaction(run, { isolation: 'serializable' })` runs `run` in a
   serializable transaction. Without the option, a transaction keeps read
   committed (D-66).
2. When the database aborts it for a conflict with another transaction, a
   serialization failure or a deadlock, the kernel rolls it back and runs
   `run` again from the start, in a new transaction, 3 attempts at most. A
   conflict caught inside `run` still fails the attempt (D-36). The third
   conflict fails with `CONFLICT`, status 409, a new kernel code: "This
   operation conflicted with another; try it again."
3. `run` must be safe to run again: what it does outside the database, an
   email or an HTTP call, belongs in a `*Commit` hook or after
   `transaction`. The `*Commit` hooks run once, for the attempt that
   commits; a failed attempt leaves no row, no feed change and no commit
   hook.
4. Inside a serializable transaction, `transaction(run)` joins it, with or
   without the option. The option inside a read committed transaction, a
   hook's own included, throws: "A transaction cannot become serializable
   once it began; open the serializable transaction first."
5. Outside a serializable transaction, a conflict is not retried, since
   nothing says that what ran is safe to run again, and it stays an
   ordinary error: a deadlock of two read committed writes is logged and
   reaches the client as `INTERNAL`, a bug to fix rather than a request to
   retry.
6. The adapter's `begin(options?: { isolation?: 'serializable' })` opens
   the transaction, and an adapter reports a conflict by throwing
   `Conflict`, as it throws `UniqueViolation`. PostgreSQL begins with
   `isolation level serializable` and reports `40001` and `40P01` as
   `Conflict`. An adapter that cannot hold serializable isolation throws
   from `begin` when asked for it, never opens a weaker transaction.
   `memory()` holds it: it runs its transactions one at a time. `testAdapter` checks that two
   serializable transactions that each read what the other writes never
   both commit on what they read: one waits, or one throws `Conflict`.
7. PostgreSQL follows what a serializable transaction read by the index
   pages it went through; a table scan follows the whole table, so every
   serializable transaction on that table conflicts with the others. The
   transactions guide says to index the fields such a transaction reads by.

Why:

- A function that reads, decides, then writes cannot be made safe when the
  row it checks does not exist yet: `for update` cannot lock an absent row,
  and under read committed two calls each miss the other's uncommitted row.
  Two users liking each other at the same moment lose their match: 8 to 12
  of 20 pairs matched on PostgreSQL.
- Measured on PostgreSQL 15, 20 pairs liking each other at once, each call a
  serializable transaction: with an index on the fields read, the 20 pairs
  matched and no call needed more than 2 attempts; a random delay between
  attempts changed nothing. Without the index, 3 attempts matched no pair,
  and 100 needed up to 30.
- The retry belongs to the kernel: every such function would otherwise
  write the same loop, and a conflict is an error a client can only retry.

Rejected:

- A `retries` option: with an index, 2 attempts were enough; without one,
  no count is, and a larger one would hide the missing index.
- Serializable by default: D-66 and D-99 still hold; most writes lock the
  rows they decide from and need no retry.
- An advisory lock key, `transaction(run, { lock: 'like:ada:bob' })`: it
  serializes the calls without retries, but the application must name
  every key a conflict can come from, and a key it misses is the silent
  race again.
- `retryOn: ['UNIQUE_VIOLATION']`, or a guide recipe catching
  `UNIQUE_VIOLATION` and reading back: the lost match of read committed
  stays the application's, and a model without a unique index to fail on
  keeps the duplicate.
- Retrying a read committed transaction's deadlock, or reporting it as
  `CONFLICT`: its `run` was not declared safe to run again, and a 409 the
  client retries would hide a lock order to fix.

Example, before: the like is saved, then the match decided, in read
committed; two calls at once each miss the other's like.

```ts
const like = defineFunction({
	name: 'like',
	input: z.object({ user: z.string() }),
	run: async ({ caller, input }) => {
		const me = userOf(caller)
		return transaction(async () => {
			const mine = await Like.create(
				{ data: { user: me, target: input.user } },
				M,
			)
			const theirs = await Like.findFirst(
				{ where: { user: input.user, target: me } },
				M,
			)
			if (theirs === null) return { matched: false }
			await befriend(me, input.user)
			await Like.updateMany(
				{
					where: { id: { in: [mine.id, theirs.id] } },
					data: { matchedAt: new Date() },
				},
				M,
			)
			return { matched: true }
		})
	},
})
```

After: the same `run`, serializable, and an index on what it reads by.

```ts
const Like = defineModel({
	name: 'Like',
	fields: (f) => ({
		user: f.string(),
		target: f.string(),
		matchedAt: f.dateTime({ optional: true }),
	}),
	indexes: [{ fields: ['user', 'target'] }],
})

return transaction(
	async () => {
		// … unchanged
	},
	{ isolation: 'serializable' },
)
// Both calls at once: one commits, the other runs again, sees the first
// like and makes the match. A client sees `CONFLICT` only after 3 attempts.
```

## D-180: A virtual's `needs` is checked on its field

Choice: amends D-151.

1. A name in a virtual's `needs` that is not a scalar field of the model, its
   own or one a plugin of its `use` adds, fails to compile on the virtual's
   line in `fields`, with TypeScript's suggestion of the closest name:
   `Type '"covr"' is not assignable to type '"cover" | keyof SystemFields'. Did you mean '"cover"'?`
   `.with({ virtuals })` reports nothing more.
2. While a model's fields do not compile, `.with({ virtuals })` takes any
   rule, and its `record`, `records` and `input` are `unknown`: the fields'
   error shows alone, with no implicit `any` after it.
3. `needs` offers no completion.

Why:

- The check ran in `.with({ virtuals })` and replaced the rule's type, so
  the error named `run`, away from the misspelt name, and every parameter of
  `run` became an implicit `any` (TS7031).
- `fields` already checks each field against the model's fields once they
  are known (`declaredRecord`, D-44): its return type is intersected with a
  check of itself. A virtual's options are part of its field, so the same
  check reaches `needs` without a generic `.with`.
- An error in `fields` makes TypeScript infer the model's fields as the
  general `FieldShapes`, whose virtuals' rules were `{}`. A rule for those
  fields with `unknown` facts keeps the error where the mistake is.
- Completion was tried on the field, with the check above and with an
  always-on `needs?: readonly (keyof RecordOf<F>)[]`: TypeScript offers none,
  as it offers none for an index's `fields` (D-52), since both are inferred
  from the literal they check. It needs the field's type to be known before
  the model, the cycle D-151 rejects.

Rejected:

- A required property named after the message on the rule in
  `.with({ virtuals })`, as the issue proposed: the error stays away from the
  name, and TypeScript prints the whole rule's type.
- A generic `.with` for completion: the TS7022 cycle of D-151.

Example, before: two errors on `run`, none on the typo.

```ts
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		cover: f.string({ optional: true }),
		hasCover: f.virtual(z.boolean(), { needs: ['covr'] }),
	}),
}).with({
	virtuals: {
		// TS2353: 'run' does not exist in type '{ readonly unknownNeeds: "covr"; }'.
		// TS7031: Binding element 'record' implicitly has an 'any' type.
		hasCover: { run: ({ record }) => record.cover !== null },
	},
})
```

After: one error, on the typo.

```ts
export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		cover: f.string({ optional: true }),
		// TS2322: … Type '"covr"' is not assignable to type
		// '"cover" | keyof SystemFields'. Did you mean '"cover"'?
		hasCover: f.virtual(z.boolean(), { needs: ['covr'] }),
	}),
}).with({
	virtuals: {
		hasCover: { run: ({ record }) => record.cover !== null },
	},
})
```

## D-181: auth's `signedInRun`, a function's `run` for signed-in users

Choice: auth exports `signedInRun(run)`, the function counterpart of
`signedIn` (D-79).

1. It returns a `run` that passes the function's facts through and adds
   `user`, typed `UserOf<Register>` (D-62). Its facts come from the
   function, as `signedIn`'s come from the rule, so `input` keeps its type.
2. Any other caller is refused with
   `PublicError('UNAUTHENTICATED', 'This function needs a signed-in user.')`.
   Master is refused too: it has no user, and a function that serves Master
   reads `caller` instead.
3. The access rule stays the guard: with `access: isAuthenticated`, a
   visitor is refused with `ACCESS_DENIED` before `run`, and the wrapper
   only meets Master or a caller a wider rule lets in.
4. password's `changePassword`, `sendVerificationEmail` and
   `requestEmailChange` use it, behind `allow.public` as before, so a
   visitor still gets `UNAUTHENTICATED`; their message is now the wrapper's.
5. `RunFacts<I>` has no `input` when `I` is `never`: TypeScript reads a
   wrapper's facts before it infers `I`, as `never` for a function without
   an input, which gave `input: never`.

Why:

- The access rule is declared in `.with`, after `run`, and cannot narrow its
  type, so each signed-in function checked `caller.kind` again. The
  repository wrote that check three ways, one a plain `Error` that answered a 500.
- `signedIn` returns `false` to anyone else, which is no function's output.
- It lives in auth for the reason D-79 gives: the kernel knows no user model.

Rejected:

- `.with({ access })` narrowing `run`'s facts: `run` would have to be typed
  after the rule, while `defineFunction` takes it first.
- The function's name in the message: the wrapper does not know it, and the
  client knows what it called.

Example:

````ts
// Before: the check in each function, and a 500 from a plain Error
export const archiveNote = defineFunction({
	name: 'archiveNote',
	input: z.object({ id: z.string() }),
	output: Note,
	run: async ({ input, caller }) => {
		if (caller.kind !== 'user') throw new Error('A user is required.')
		const me = caller.user.id
		// ...
	},
}).with({ access: isAuthenticated })

// After
export const archiveNote = defineFunction({
	name: 'archiveNote',
	input: z.object({ id: z.string() }),
	output: Note,
	run: signedInRun(async ({ input, user }) => {
		const me = user.id
		// ...
	}),
}).with({ access: isAuthenticated })

## D-182: A function returns a page shaped like the generated lists

Choice: amends D-45 (its `paginated(Todo)` is out of 0.1) and completes
D-109 and D-134.

1. `Model.paginated()` is a function's output, as `Model.nullable()` is
   (D-109): at the root of the output, or a field of a `defineType` at any
   depth of single or nullable types. It is refused at definition under a
   list (`[Type]`), at any depth, since each item would be one read and one
   count (D-46), and in a virtual's output. A type has no `.paginated()`,
   and a page has no `.nullable()`: an empty page is a page.
2. A function with a page in its output is a query (`query: true`),
   refused at definition otherwise, and is not live: the realtime plugin
   refuses it at startup (D-154).
3. `Model.paginate(args, options)` takes `findMany`'s `where` and
   `orderBy`, and its options. It reads nothing: it returns a page source,
   whose `findMany({ take, skip, cursor })` reads the rows and whose
   `count()` counts them, both with that `where`, that `orderBy` and that
   `as`. `run` returns it where the output has `Model.paginated()`, typed;
   `fn.run(input, { as })` returns it as `run` did. A page source is not a
   Promise: `await` gives the source itself.
4. Each transport reads the page as it reads the model's generated list:
   the same arguments (`first`, `after`, `last`, `before` for a connection,
   `take` and `skip` for a list, D-41), the same bounds (`take`, `maxTake`,
   Master unbounded, D-55), the same cursors and errors. GraphQL adds them
   to the field, the function's root field or the type's field, and
   returns the model's connection type (`FriendshipConnection`) or its
   list. REST reads them as the model's list endpoint does: flat
   parameters for a page at the root, and one JSON parameter named by the
   field's path for a page in a type (`friendships={"first":20}`), as a
   nested `include` takes them (D-134 point 6); its answer and its OpenAPI
   schema are the model list's. A function input property or a parameter
   named like a page argument is refused at startup.
5. The count is the generated lists': `totalCount`, counted only when the
   client selects it in GraphQL, once however many aliases ask, or sends
   `totalCount: true` in REST; none with `pagination: 'list'`; the source's
   `where` and `as`, so it counts the rows the page pages; and the row
   budget counts it as a list's (D-134 point 7).
6. A page's rows leave as a `[Model]` output's (D-109): their scalars as
   the source read them, their relations and default virtuals read again
   by `id` as the caller. A client adds no `where` or `orderBy` to a page:
   its filters are the function's input.
7. The rows and the count are two reads, as for the generated lists: they
   share no snapshot (D-66).

Why:

- A function serves the lists a generated query cannot, typically when its
  filter reads rows the caller may not read and it filters as Master. With
  `[Model]` and a hand-written `defineType` holding a list and a count, the
  client kept two pagination shapes and two cache policies, each function
  copied `take` and `maxTake` into its input, and the count ran on every
  call, selected or not.
- The transport, not `run`, applies the page: `run` cannot forget it, the
  kernel holds no Relay cursor (the reason of D-45), and the code that pages
  the generated lists pages these, so the shapes cannot drift.
- `Model.paginated()` follows `Model.nullable()`: an output form is read on
  the model, with nothing to import.
- A page under a list would read once per item, the N+1 that D-46 rules
  out for relations.
- One snapshot for the rows and the count would set functions apart from
  the generated lists; it is a decision for both.

Rejected:

- `run` receiving `page` and calling a `findPage` that reads: a forgotten
  `...page` pages nothing without an error, and the kernel learns Relay's
  arguments.
- A thenable page source, which `await` reads: a hidden read, with no page
  size and no count chosen.
- `fn.run(input, { as, page })` returning rows: a second way to call a
  function, where the source's two methods suffice.
- `paginated(Model)`, imported: unlike `Model.nullable()`.
- A page at the root only: a function returning a profile and its friends'
  page needed two functions.

Example, before: a page type, bounds and a count written by hand.

```ts
const MutualFriendships = defineType({
	name: 'MutualFriendships',
	fields: { friendships: [Friendship], totalCount: z.int() },
})

export const mutualFriendships = defineFunction({
	name: 'mutualFriendships',
	query: true,
	input: z.object({
		userId: z.uuid(),
		take: z.int().min(1).max(100).default(20),
		skip: z.int().min(0).default(0),
	}),
	output: MutualFriendships,
	run: async ({ input }) => {
		const where = { friend: { is: { id: input.userId } } }
		const [friendships, totalCount] = await Promise.all([
			Friendship.findMany(
				{
					where,
					orderBy: { createdAt: 'asc' },
					take: input.take,
					skip: input.skip,
				},
				{ as: master },
			),
			Friendship.count({ where }, { as: master }),
		])
		return { friendships, totalCount }
	},
})
````

After: the model's page, read and counted by the transport.

```ts
export const mutualFriendships = defineFunction({
	name: 'mutualFriendships',
	query: true,
	input: z.object({ userId: z.uuid() }),
	output: Friendship.paginated(),
	run: ({ input }) =>
		Friendship.paginate(
			{
				where: { friend: { is: { id: input.userId } } },
				orderBy: { createdAt: 'asc' },
			},
			{ as: master },
		),
})

// GraphQL: mutualFriendships(userId: "u2", first: 20) { edges { node { id } } pageInfo { endCursor } totalCount }
// REST: GET /functions/mutualFriendships?userId=u2&first=20&totalCount=true
// Server code: const page = await mutualFriendships.run({ userId }, { as: ada })
//              await page.findMany({ take: 20 }); await page.count()
```

## D-183: A serializable retry waits, 10 attempts at most

Choice: amends D-179, points 2 and 7 and its reasons.

1. A serializable transaction that conflicts runs again after a random wait
   between 0 and 20 × n ms, n being the attempts that conflicted so far: at
   most 20 ms before the second attempt, 40 before the third. It runs 10
   attempts at most, about 900 ms of waits at worst; the tenth conflict
   fails with `CONFLICT`.
2. Still no `retries` option.
3. PostgreSQL follows what a serializable transaction read by index page,
   not by row: transactions that share a page conflict, their rows apart or
   not. They share one on a small table, whose index fits on a page, on an
   index led by a time-ordered id, the kernel's UUIDv7 among them, whose
   recent rows end on its last page, and on a small table the planner reads
   whole, index or not. The transactions guide says so next to its advice
   to index the fields read.

Why:

- D-179 measured a populated table with random keys and no relation. An
  application migrating from Parse saw `CONFLICT` with unrelated users on
  fresh tables. Measured with the kernel, 10 pairs liking each other at
  once on fresh tables, `User`, `Heart` with a unique `(from, to)` index
  and `Match`, 3 runs each: 3 attempts with no wait left 5 to 8 of the 20
  calls in `CONFLICT`, on PostgreSQL 15 and 18; 3 attempts with the wait,
  2 to 4. With 100,000 rows and UUIDv7 keys, 8 to 10 of 20.
- 10 attempts with the wait: no call failed in any of these runs, none
  needed more than 5 attempts, and a third committed at the first. At 50
  pairs, none failed, 8 attempts at most; at 100 pairs, none failed, 9 at
  most, 1.2 to 1.4 s for all of them. 10 attempts with no wait also left
  none failed at 10 pairs, but needed 7.
- D-179's "a random delay changed nothing" held where 2 attempts were
  enough; where calls share a page, the wait is what lets them commit
  apart.
- The right count depends on the load at that moment, not on the
  function, so an option would be a guess written once; waits grow with
  the square of the count, 20 attempts reaching about 3.8 s. An option can
  come later without breaking a call; removing one would.

Rejected:

- A `retries` option, for the reasons above.
- An exponential backoff, base 10 ms up to 1 s: slightly fewer attempts,
  but 1.7 to 2 s at 100 pairs instead of 1.2 to 1.4.
- 5 attempts with waits up to 50 × n ms: 3 to 5 % of calls failed at 50
  pairs, about 13 % at 100.
- A warning logged after many attempts: on a fresh table in development it
  would fire for every burst, with nothing to fix.

Example, before: the same code as D-179's, on fresh tables; 10 pairs liking
each other at once.

```ts
return transaction(
	async () => {
		const mine = await Heart.findFirst({ where: { from: me, to } }, M)
		// … create it, read the reverse heart, make the match
	},
	{ isolation: 'serializable' },
)
// 5 to 8 of the 20 calls fail with `CONFLICT` after 3 attempts.
```

After: unchanged code; the 10 pairs match, each call after 5 attempts at
most.

## D-184: A virtual's `needs` takes a stored `one` relation's key

Choice: amends D-151.

1. A virtual's `needs` names, besides scalar fields, a `one` relation the row
   stores (D-77): a required one, or an optional one facing a `many`. A
   `many` fails to compile on the virtual's line. The optional side of a
   one-to-one, which has no column (D-37), compiles there, since the line
   cannot read the target's fields; its rule's `record` has no such key, and
   it stops startup. Both stop startup.
2. `record.author` is the key as rules and hooks see it, `{ id }`, or
   `{ id } | null` when the relation is optional: no `authorId` string.
3. The kernel reads the key with the row's columns, in the same query; a
   `run` gets it with no other query. A query that also includes the
   relation reads the target's row in its place, which is `null` when the
   relation is empty or the caller cannot read that row (D-109): the keys of
   those rows are read again, in one query for the page, and the virtual
   gets the key either way.
4. A relation's read rule hides the virtuals that need it, as a scalar's
   does (D-151).
5. `needs` takes no target field: `needs: ['author.name']` stays refused; a
   virtual that reads the target's fields queries them in `runMany`.

Why:

- A virtual that compares a row's owner with the caller is common (`isMine`,
  `canEdit`); without the key, its `runMany` re-reads the page by id to get
  it, one query per page for a column the row already holds.
- The key is a column of the row: reading it costs nothing more, as a
  scalar's does. A `many` or the optional side of a one-to-one is a query on
  another table.
- Rules and hooks already see a stored `one` as `{ id }` (D-77); a virtual's
  record is the same record, cut to its needs.
- An included row the caller cannot read gave the virtual `null` for a
  required relation, typed `{ id }`: its `run` failed on `record.author.id`.
  A row holds one value per field, so the adapter cannot return the key and
  the included row side by side.

Rejected:

- An `authorId` string: a second name for the same key, which rules and hooks
  do not use.
- Target fields (`author.name`): a join per virtual, with its own read rules,
  which `runMany` already writes in one query for the page.
- A `many`'s ids: a list per row, read by another query, which `runMany`
  writes as well.
- Refusing the optional side of a one-to-one on the virtual's line: telling
  it from a stored `one` reads the target's fields while the model is typed,
  the TS7022 cycle of D-151 when the target relates back.

Example, before: `needs` refuses the relation, and `runMany` reads the page
again to get its key.

```ts
export const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		author: f.one(() => User, { default: currentUser }),
		body: f.string(),
		// TS2322: Type '"author"' is not assignable to type '"body" | keyof SystemFields'.
		isMine: f.virtual(z.boolean(), { needs: ['author'] }),
	}),
}).with({
	virtuals: {
		isMine: {
			runMany: async ({ caller, records }) => {
				const rows = await Comment.findMany(
					{
						where: { id: { in: records.map(({ id }) => id) } },
						select: { id: true, author: { select: { id: true } } },
					},
					{ as: Master },
				)
				const authors = new Map(rows.map((row) => [row.id, row.author.id]))
				return records.map(
					({ id }) =>
						caller.kind === 'user' && authors.get(id) === caller.user.id,
				)
			},
		},
	},
})
```

After: the key comes with the row.

```ts
export const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		author: f.one(() => User, { default: currentUser }),
		body: f.string(),
		isMine: f.virtual(z.boolean(), { needs: ['author'] }),
	}),
}).with({
	virtuals: {
		isMine: {
			run: ({ caller, record }) =>
				caller.kind === 'user' && record.author.id === caller.user.id,
		},
	},
})
```

## D-185: GraphQL counts no connection level, and refuses a relation read twice at validation

Choice: amends D-107, point 6 by point 2 and point 10 by point 3.

1. Every connection has `totalCount`, nested ones included, as D-134 point
   5 says; the GraphQL guide said the root list only, and now says so.
2. With `pagination: 'connection'`, the fields of a generated connection
   and edge type, `edges`, `node`, `cursor`, `pageInfo` and `totalCount`,
   are no level of `maxDepth`, nor of the depth of an `orderBy` under them.
   The parent type decides, not the field's name: a model's own field named
   `node` or `edges` counts. `PageInfo`'s fields count, a model's fields,
   root fields and an object field's fields too. `pagination: 'list'` is
   unchanged, every field counting. The default stays 10.
3. A `many` relation or a virtual selected twice with different arguments
   is refused as the document is validated, for every caller, Master
   included, before a query, a mutation or a subscription runs, over HTTP
   and WebSocket alike: `comments is selected twice with different
arguments, at posts.edges.node.commenterIds and posts.edges.node.comments;
read it once.`, with no code, as the depth refusal. A model's fields
   merge by name, through aliases, fragments and connections, as the
   kernel's one `select` per row merges them; a root field and a field
   `extend` adds resolve once per alias, so what they select is compared
   per response path. Arguments compare as written, in any order and an
   input's fields in any order: two variables differ, even of one value,
   and `@skip` or `@include` changes nothing. Two arguments under one
   response path stay graphql-js's own refusal. The run-time check is
   removed, since nothing reaches it. The guide shows the workaround: select
   the relation once with what both fragments need, and slice it on the
   client.

Why:

- Each nested list cost three levels, the relation, `edges` and `node`, so
  the default 10 allowed about three nested lists, where REST's 10 allows
  ten levels of `select` and `include`. Counting a model's fields only, the
  two transports count the same levels (D-129). `maxRows` already bounds
  how many rows nested lists return; depth bounds how many relations a
  document goes through, which the wrappers do not add to.
- Deciding by the parent type keeps a model free to name a field `node`:
  a name-based rule would let any model nest through it for free.
- The run-time refusal came after the document validated and type checked,
  when a screen first loaded; inside a live query, the whole screen stayed
  empty. Validation refuses it where every other limit is refused, with
  both paths, which two colocated fragments in different files need.
- Comparing the written arguments, not their values, decides before
  variables are read and gives the same answer for every request of a
  document, which a check in CI can rely on.

Rejected:

- Reading each alias as its own subquery: the kernel reads one `select`
  per row, so it needs a second read per alias and a merge of the rows; the
  issue's own first choice, kept out of scope.
- Counting by field name (`edges`, `node`), for the reason above.
- Exporting `depthRule` or a `validateDocuments` helper: no decision needs
  them yet.
- Comparing argument values: a document would pass or fail with its
  variables.

Example, before: the issue's document, refused at the default `maxDepth`.

```graphql
query {
	posts(first: 10) {
		edges {
			node {
				comments(first: 3) {
					edges {
						node {
							photos(first: 1) {
								edges {
									node {
										file {
											url
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
}
# The document is nested 11 levels deep; the most is 10.
```

After: the same document passes, 5 levels deep; 11 levels of model fields
are still refused.

Before: two fragments of one post, refused only as the query ran.

```graphql
fragment PostCard on Post {
	commenterIds: comments {
		edges {
			node {
				author {
					id
				}
			}
		}
	}
	...PostFooter
}
fragment PostFooter on Post {
	comments(first: 3) {
		totalCount
		edges {
			node {
				id
				body
			}
		}
	}
}
# BAD_USER_INPUT: comments is selected twice with different arguments; read it once.
```

After: refused as the document is validated, naming both paths; the
fragments select the relation once and slice it on the client.

```graphql
fragment PostCard on Post {
	comments {
		totalCount
		edges {
			node {
				id
				body
				author {
					id
				}
			}
		}
	}
}
# PostFooter receives the first 3 of PostCard's comments.
```

## D-186: A live list is bounded by `maxLive`, and its refusal says so

Choice: amends D-154, points 3 and 7.

1. `maxTake` bounds a live list in page mode only, where each change
   resends the whole window. Outside page mode, a live list's `first` (or
   `take`), at subscribe and at each growth, is bounded by `maxLive` and
   `maxConnectionRows` only, over GraphQL and REST alike. A nested list in
   a live selection keeps its model's `maxTake`, as in a query.
2. The cost stays `first × (1 + the nested rows of each row)`, a nested
   list counting its `take` rows and theirs. The realtime guide gives it
   next to `maxLive`, with an example, and the per-model
   `.with({ realtime: { maxLive } })`.
3. A refusal past `maxLive`, at subscribe or at a growth, stays
   `VALIDATION_FAILED` with the same message, and carries
   `details: { issues: [{ path: ['first'], message }], limit, rows }`:
   `limit` the model's `maxLive`, `rows` what the list would follow, nested
   rows included. GraphQL sends it under `extensions.details`, REST in its
   `400` body, as every public error's details. The `maxConnectionRows`
   refusal is unchanged.
4. A growth refused leaves the list as it was. The transport keeps it under
   the same token, for 10 s, as a completed list: what it sends meanwhile
   waits. `@ultimabase/live`'s `fetchMore` rejects with the refusal, takes
   back its variable (Apollo) or its URL's `first` (`liveFetch`), and
   resumes at the previous size; the subscription's observer and
   `liveFetch`'s listeners see no error. A refusal at subscribe still fails
   the read.
5. `LiveError` gets `details`, the server's, when it sends a record.

Why:

- `maxTake` exists because a page's every row is read and sent each time.
  A live list sends only what changed, and `maxLive` is the limit made for
  it: capping it at `maxTake` made `maxLive` above 100 unreachable at
  subscribe, while growth already passed it.
- A client cannot know where the limit is before it hits it; with `limit`
  and `rows` it switches to ordinary cursor reads, as a chat history does,
  without parsing the message.
- A growth the server refuses is the client asking too much once, not a
  broken read: ending the list made the client read everything again.

Rejected:

- Growing up to the limit and no further: `fetchMore` would resolve with
  fewer rows than asked, and `hasNextPage` would stay true with nothing to
  fetch.
- A new error code for the limit: `VALIDATION_FAILED` with its details
  tells the same, and the codes stay the few clients branch on.
- Publishing `maxLive` in the schema or a header: the refusal already
  carries it, where the client needs it.

Example, before: a chat follows its newest messages live, 100 more at a
time.

```ts
const live = liveFetch<Page>(`/api/messages?first=125&orderBy=${orderBy}`)
// 400 BAD_USER_INPUT: first is at most 100 on Message.
await live.fetchMore({ first: 900 })
// Past maxLive: the stream ends, and the listeners get the LiveError.
```

After:

```ts
const live = liveFetch<Page>(`/api/messages?first=125&orderBy=${orderBy}`)
try {
	await live.fetchMore({ first: 900 })
} catch (error) {
	if (!(error instanceof LiveError)) throw error
	error.details // { issues: [...], limit: 1000, rows: 1025 }
	// The list goes on with its 125 messages; read older ones by cursor.
	const after = latest?.pageInfo.endCursor
}
```

## D-187: A live read follows its virtual fields' reads

Choice: amends D-154, points 10 and 12, and completes D-151.

1. A live row or list that selects a virtual field records the reads its
   `run` or `runMany` makes, as a live function's (D-154, point 12). The
   rows read together share them. A write that may change one of those
   reads computes these rows again, as the subscriber; a row whose value
   changed is sent again, the others are not.
2. Nothing to declare: no `live` option on the virtual, no list of models
   it depends on. A live read that selects no virtual costs nothing more.
3. Whether a write may change a read is decided more finely, for the
   rights of a caller and for live functions too:
   - A read without ids, a count or a group, is stale only when an inserted
     row passes its `where`, a row is deleted, or an updated row may pass
     it before or after the update. Before, any write to its model made it
     stale.
   - A `where` through a stored `one` relation, as `project: { is: … }`, is
     stale on any write to the related model, as before. A write to the
     read's own model is tested against the `where` loosened to what its
     rows hold: the related id, which the stored key holds. A read rule of
     the related model joins that relation's filter, so without this every
     write to the model counted made every subscriber stale.
   - Another `where` that a row alone does not answer, a text search or an
     `OR` through a relation, stays coarse: any write to its model or a
     model it reaches makes it stale.
4. A delete still recomputes every row whose virtuals read its model: a
   write carries no old values, so which rows read the deleted one is not
   known.

Why:

- The issue: a live project showing `openTasksCount` did not move when a
  task was created, and a client had to open a second subscription for the
  count. Live functions already follow their reads; a virtual is the same
  kind of `run`.
- A declared dependency (`live: [() => Task]`) would resend every row on
  any write to `Task` and is one more thing to keep in sync with `run`.
- Measured with `bench/realtime/virtuals.ts`, 1000 subscribers listing
  `Project` with a virtual counting its open `Task` rows through a
  `groupBy` as the caller, one `Task` created a write, p50 times:

  | Lists       | Window | Followed coarsely                      | This decision                    |
  | ----------- | -----: | -------------------------------------- | -------------------------------- |
  | a list each |     25 | 2000 statements, 1000 messages, 463 ms | 3 statements, 1 message, 69 ms   |
  | a list each |   1000 | 17.2 s, p99 103 s                      | 3 statements, 1 message, 122 ms  |
  | one list    |     25 | 1001 statements, 301 ms                | 1002 statements, 319 ms          |
  | one list    |   1000 | 11.1 s                                 | 10.3 s, the last message at 20 s |

  "Followed coarsely" is any write to `Task` computing every shown row
  again and sending it. A live read that selects no virtual runs no
  statement on such a write, before as after.

- One list followed by 1000 subscribers stays costly: each one computes the
  virtual as itself, one `groupBy` each, since a read rule may give each a
  different count. Sharing the value between subscribers would be wrong as
  soon as a rule reads the caller. Computing again only the row the write
  touched is not possible either: `runMany` may compute a row from the
  others.
- Grouping writes close in time, as a live function's wait does, helps a
  burst but not one write, and delays every message; not done.

Rejected:

- A `live` option listing the models a virtual reads, for the reasons
  above.
- Sending again every row whose virtuals read a model written: what the
  first table measures.

Example, before: a live list showing a count of another model.

```ts
await viewer.list(
	'Project',
	{ first: 25, select: { name: true, openTasks: true } },
	send,
)
await Task.create({ data: { project: { connect: { id: a } } } }, M)
// Nothing is sent; A shows its old count until A itself changes.
```

After: unchanged code; the row of A alone is sent again, with
`openTasks: 1`.

## D-188: A route empties the database outside production

Choice: completes D-49, D-105 and D-106.

1. `httpPlugin()` serves `POST /_ultimabase/reset` when `NODE_ENV` is not
   `production`. Under `ultimabase start` the route does not exist: it
   answers 404 as any unknown path.
2. Only Master through the master key (D-49) calls it; another caller gets
   `ACCESS_DENIED`. It answers 204.
3. It empties the rows of every model and keeps the tables: the adapter
   gains a required `empty()`. `memory()` clears its rows; `postgres()`
   truncates the models' tables in one statement with `cascade`, as its
   test setup does (D-137), and keeps `ultimabase_schema` and the migrations.
   The models of plugins are emptied too, auth's users and sessions among
   them. No hook, cascade rule or soft delete runs. Stored files stay where
   their storage keeps them.
4. The kernel then calls the feed's `missed()` (D-168): live reads read
   again, and find nothing.
5. GraphQL and REST do not expose it. It takes no option; the application
   seeds its own data afterwards.
6. A remote database is not refused, unlike `ultimabase reset`: the master
   key and `NODE_ENV` already keep the route out of production.
7. The testing guide shows it in an "End-to-end tests" section.
8. It runs alone: it waits for the operations running, `*Commit` hooks
   included, and holds new ones until the database is empty; what a running
   operation starts is part of it and is not held. When operations still run
   after 5 seconds, it fails with `INTERNAL`, empties nothing and lets the
   held ones through; the error tells how many ran. Open sockets stay
   connected (amended 2026-11-02).

Why:

- A front end's end-to-end test starts each test from known data, seeded
  through the API with the master key (D-49), while the server runs. It had
  no way to start again from an empty database but to restart the server.
- `ultimabase reset` rebuilds the database from the migrations, but under
  `ultimabase dev` the database follows the models through `sync` (D-105):
  it may hold fields no migration has yet. Replaying the migrations would
  remove them under the running application. Truncating gives the test the
  same result, an empty database with the current tables, without touching
  the tables.
- One `truncate` costs one statement, whatever the number of tables, which
  a `beforeEach` runs every test.
- A page of the previous test, still connected, writes while the next
  test resets: the truncate locked one table and waited on another that the
  write held, which then waited on the first, and PostgreSQL ended the reset
  with `deadlock detected`. Running alone leaves no write of the application
  to wait on. The limit keeps an operation that never ends from blocking the
  test run (amended 2026-11-02).

Rejected:

- Dropping the tables and replaying the migrations, for the reasons above.
- `deleteMany` on each model: it runs hooks and soft deletes, and must
  follow the relations' order.
- A GraphQL mutation: a schema that differs between development and
  production breaks the types a client generates from it.
- A `keep` option listing models to spare: the application seeds them
  again, as it seeds the rest.
- A command run from the test: it would empty the tables outside the
  running server, whose live reads would not know.
- Retrying the truncate on `deadlock detected`: each try can meet a write
  again, and a retry hides the race rather than ending it.
- Locking the tables in a fixed order first: the write takes its own locks
  in its own order.
- Ending the other connections to the database: realtime's listening
  connection and the pool's would end with them, and the requests running
  would fail with errors of the driver (amended 2026-11-02).

Example, before: a Playwright test cannot empty the database without
restarting the server.

```ts
test.beforeEach(async () => {
	// restart `ultimabase dev`, or run `ultimabase reset` and wait for it
})
```

After:

```ts
test.beforeEach(async () => {
	await fetch('http://localhost:3000/_ultimabase/reset', {
		method: 'POST',
		headers: { 'x-ultimabase-master-key': process.env.MASTER_KEY ?? '' },
	}) // 204
	await seed()
})
```

## D-189: `viewer` filters a relation to the signed-in user

Choice: completes D-20, D-62 and D-86.

1. A filter of a relation to the user model takes `viewer: true` or
   `viewer: false`. On a `one` relation, `true` holds when the related row
   is the caller's user, `false` when it is another row or none. On a
   `many` relation, `true` holds when one of the related rows is the
   caller's user, `false` when none is.
2. The kernel reads it with the caller, as it reads the rest of the filter:
   `{ is: { id: { equals: caller.user.id } } }`, `isNot`, `some` and
   `none`. Adapters and the realtime engine see only these operators. An
   anonymous caller and Master are no user: `true` matches no row, `false`
   every row.
3. It works wherever a filter does: queries from code with `as`, access
   rules' `where`, REST, GraphQL and live reads, which read their caller
   again when it changes (D-178).
4. `definePlugin` takes `userModel: true`: the model that lists such a
   plugin in its `use` is the user model. auth declares it (D-62). Two such
   models stop startup. Without one, every `viewer` fails, and `viewer` on
   a relation to another model fails with `INVALID_QUERY`, naming the
   field.
5. Types: `viewer?: boolean` is on the filters of relations whose target
   is `Register['user']`. Without that declaration, no filter has it in
   TypeScript; REST and GraphQL still take it.
6. GraphQL adds `viewer: Boolean` to the filter inputs of relations to the
   user model, and to no other.
7. `viewer` combines with the relation's other operators, all of which
   hold: `owner: { viewer: false, is: { name: 'Ada' } }`.

Why:

- A client lists the rows of one of its user's roles per tab: owned
  projects, projects shared with it. It had to load its own user first and
  send its id in every filter, though the server knows the caller.
- The kernel resolves the filter from the session, so a client cannot
  name another user through it, and one filter serves every user.
- A plugin flag keeps the kernel free of auth: any plugin that identifies
  users as rows of a model can declare it.

Rejected:

- A sentinel in the id operators (`{ id: { equals: VIEWER } }`): it mixes
  a value with an operator, and GraphQL cannot type it.
- `isViewer` and `someIsViewer`: one name reads right on both kinds of
  relation.
- `viewer` on every relation: on another model it would always be false.
- A `defineApp({ user })` option: it repeats `defineUser`, which auth
  already knows.

Example, before:

```graphql
query Owned($userId: ID!) {
	projects(where: { owner: { is: { id: { equals: $userId } } } }) {
		edges {
			node {
				name
			}
		}
	}
}
```

After: no variable, and the query runs before the client knows its user.

```graphql
query Owned {
	projects(where: { owner: { viewer: true } }) {
		edges {
			node {
				name
			}
		}
	}
}
# Shared with me: where: { members: { viewer: true }, owner: { viewer: false } }
```

```ts
// An access rule
read: ({ where }) => where({ members: { viewer: true } }),
```

## D-190: A json schema named as a GraphQL scalar

Choice: completes D-109 and D-125.

1. A schema whose metadata gives an id and `scalar: true`,
   `.meta({ id: 'RichText', scalar: true })`, is the GraphQL scalar
   `RichText`, read and written whole, in place of the object type D-125
   point 3 would make. GraphQL declares it once, described by the schema's
   description, and uses it on both sides: a scalar has no input type.
2. The id is read where D-125 point 3 reads it, from the export's `$defs`
   (Zod), and from an `id` keyword on the schema itself, as Valibot's
   `v.metadata` and ArkType's `.configure` write it. A shared object type's
   id is read the same way.
3. It applies at the field's root or deeper, `{ title, body: RichText }`,
   and in a function's schema (D-109), which shares the field's types.
4. `scalar: true` without an id is named by its path, as an object type
   is (D-125 point 3): `Note.settings` is the scalar `NoteSettings`, on
   both sides. Without `scalar: true`, nothing changes.
5. One name given two schemas stops startup, naming both owners (D-125
   point 3).
6. A field's filter stays `JSONFilter` (D-149 point 6); the kernel still
   validates the value with the schema.
7. OpenAPI keeps the whole JSON Schema (D-144), the keyword included.
8. The GraphQL guide's types table gains the line.

Why:

- A rich text document is recursive: as an object type, no selection
  reads it whole, so a client wants it as one value. As `JSON` it shares
  its name with every untyped value, and a client's codegen, which maps a
  scalar by name, cannot give it its own type.
- The developer chooses it on the schema, which already names shared types
  with `id`; the kernel gains no GraphQL option.
- Zod puts an id in `$defs`; Valibot and ArkType keep it as a keyword
  (checked on 2026-11-01 with zod 4, valibot 1.5 and arktype 2.2): reading
  both lets each library name a type.

Rejected:

- `f.json({ graphql: { scalar: 'RichText' } })`: a plugin's option on a
  kernel field.
- A scalar for every recursive schema: the developer chooses it, nothing
  is implicit.
- Stopping startup on `scalar: true` without an id: an object type
  without an id is named by its path, and a scalar can be too. The guide
  advises an id for a scalar a client's codegen maps, whose name then
  outlives a renamed field.
- A `RichTextFilter`: the path filters of `JSONFilter` already filter any
  json value.

Example, before:

```ts
body: f.json({ optional: true, validate: Node }),
```

```graphql
type Note {
	body: JSON # every untyped json value has this type
}
```

After:

```ts
const RichText = Node.meta({
	id: 'RichText',
	scalar: true,
	description: 'A Tiptap document',
})
body: f.json({ optional: true, validate: RichText }),
```

```graphql
"""
A Tiptap document
"""
scalar RichText

type Note {
	body: RichText
}
```

A client's codegen then maps `RichText` to its document type.

## D-191: GraphQL writes its schema to a file in development

Amended by D-201.

Choice: completes D-45.

1. `graphqlPlugin({ generated: 'src/generated/schema.graphql' })` writes
   the schema it serves, printed as SDL with `extend` applied, to that path
   when the application starts.
2. It writes only when `NODE_ENV` is `development`, as `ultimabase dev`
   sets it: not under `ultimabase start`, nor in tests (`test`).
3. It writes only when the file's content differs, so a client's codegen
   watching it runs only after a change.
4. The path is relative to the current directory, from which
   `ultimabase dev` runs; missing directories are created.
5. The schema is the one every caller sees (D-144): it is the same for all.
6. No command prints or checks it for now.

Why:

- A front end types its operations with GraphQL Code Generator from a
  committed schema file, so it builds and type checks without a backend,
  in CI too. Getting it took a running server, its database and an
  introspection script.
- `ultimabase dev` runs whenever the models change and restarts on each
  edit, so the file follows them with no step to remember, as a code-first
  schema builder writing its file in development did.
- The CLI need not know plugins: building the schema without starting the
  application is something only the plugin's start does.

Rejected:

- `ultimabase graphql schema [--output] [--check]`: the CLI would build an
  application without starting it, and know the GraphQL plugin.
- Returning the schema from the plugin's API: the application would still
  start itself to print it.
- A check in CI: the file is committed, and CI reads it without a backend;
  a command can come when a stale file is a problem seen.

Example, before:

```sh
ultimabase dev &
wait-on http://localhost:3000/ready
node scripts/introspect.ts > src/generated/schema.graphql
```

After:

```ts
graphqlPlugin({ generated: 'src/generated/schema.graphql' })
// `ultimabase dev` writes src/generated/schema.graphql when it changes
```

## D-192: The website shows a roadmap

Choice: completes D-155.

1. A page of `main`, `website/content/docs/roadmap.mdx`, served at
   `/docs/next/roadmap`, tells users what comes next: the items of the
   current and next phases of `docs/roadmap.md` that a user would notice,
   then those of its "Beyond" section, and how to ask for a feature.
2. It shows no phases, exit criteria or contributor tasks: those stay in
   `docs/roadmap.md`, the contract.
3. A commit that adds, ticks or removes an item of `docs/roadmap.md` a
   user would notice updates the page too.
4. `yarn freeze` leaves the page out of a frozen version: a version's pages
   describe what it does, and the roadmap moves on after it.

Why:

- A developer weighing UltimaBase, coming from Parse, asks whether OAuth
  or jobs are planned; the answer lived only in the repository, in phases
  written for contributors.
- A frozen roadmap is wrong the day after its release.

Rejected:

- Publishing `docs/roadmap.md` as it is: its phases and exit criteria
  are the restart's process, not what a user waits for.
- GitHub issues as the roadmap: they hold bugs and requests, not what is
  planned.
- A CI check that both files change together: many roadmap commits tick a
  contributor task no user sees; a check can come when the page is seen
  stale.

## D-193: `main` requires the CI checks

Choice: completes D-06 and D-156.

1. The ruleset "Protect main" requires the jobs of `ci.yml` that run on a
   pull request: Commit messages, Validate, Packed packages, Website,
   PostgreSQL and S3. A pull request merges once they pass.
2. A pull request need not be up to date with `main` to merge: the push to
   `main` runs every check again before anything is published (D-156).
3. The repository's admins may bypass the ruleset on a pull request only,
   for the release pull request: `changesets/action` opens it with the
   workflow's token, which starts no workflow, so it never has the checks.
   A direct push to `main` without passing checks is refused for everyone.
4. The rules already there stay: `main` is never force-pushed nor deleted.
5. A pull request that adds or renames such a job in `ci.yml` updates the
   ruleset when it merges.

Why:

- `AGENTS.md` asks `yarn validate` to pass before a merge into `main`, but
  nothing enforced it: a merge with the maintainer's token, an agent's
  included, could land a red pull request.
- A bypass limited to pull requests still makes a red merge explicit:
  `gh pr merge` fails, and only `gh pr merge --admin` goes through.

Rejected:

- Requiring an up-to-date branch: each merge in a series would wait for a
  new run on every other pull request, and `main` is checked after the
  merge anyway.
- A GitHub App or personal token for `changesets/action`, so the release
  pull request gets the checks: a secret to keep and rotate, for versions
  and changelogs that `main` checks again before publishing.
- Requiring a review: the project has one maintainer.

## D-194: Actions pinned by commit, dependencies updated by Dependabot

Choice: completes D-92 and D-156.

1. Every action a workflow or the setup action uses is pinned by its full
   commit SHA, its version in a comment:
   `changesets/action@ae32849d5ba541f9ae29e40e22a623bc13562f51 # v2.1.2`.
2. Dependabot updates the actions once a month, in one pull request for all
   of them, and only to a version published at least seven days before.
3. Dependabot opens a pull request for an npm dependency only when a
   security advisory names its version. It never proposes a version for
   another reason: a dependency still moves when a commit chooses to
   (D-92).
4. Its commits are `ci: …` for an action and `fix(repo): …` for an npm
   dependency. Commitlint skips the commits Dependabot signs: their
   bodies quote release notes on lines of any length.

Why:

- A tag is a pointer its owner, or whoever takes over their account, can
  move. The release job can write to the repository and publish every
  package on npm (D-156): a moved tag would run new code with those rights.
  A commit SHA names the code that was read, and only it.
- A pin nobody updates goes stale; Dependabot's pull request is the one
  way a newer action comes in, and it runs every check. Seven days give a
  compromised release time to be found and withdrawn.
- Advisories raised alerts that nobody saw: zod and happy-dom stayed on
  vulnerable versions until a push printed the count.

Rejected:

- Pinning only third-party actions: `actions/setup-node` and
  `actions/cache` run in the release job too, and pinning them costs
  nothing more.
- Dependabot version updates for npm: about fifteen manifests pin exact
  versions, so each release of a common dependency would open a pull
  request nobody asked for.
- A CI check that every `uses:` names a SHA: the workflows are two files,
  read in each pull request that changes them.

## D-195: Live reads planned once per caller

Amended by D-197.

Choice: amends D-154 points 9 and 13.

1. A live read plans its rows' read once, as its caller: the read rules and
   every `beforeFind` run when it subscribes and each time D-154 point 10
   rebuilds the caller, never on a flush. A flush reads the rows it places
   or resends from that plan: their rights checked in memory on the loaded
   row when the plan reads the row alone, as the shape selects them, the
   field rules and the virtuals run for each row as for `findMany`.
2. A subscription reads its window with one query: the stored rows of its
   filter in order, from which its rows are read as in point 1. The
   window's rows are not read a second time by id.
3. A window keeps, for each row, its id and its order keys and nothing
   more: no record for a row whose selection follows no relation, one id
   string per row, and its keys without an array when one field orders it.
4. The benchmark closes the roadmap item when, on PostgreSQL:
   - the last message of a write followed by 10 000 subscribers on one list
     of 25 rows arrives within 150 ms (p50);
   - a subscription to 1000 rows holds at most 200 B per row;
   - 10 000 subscriptions to 1000 rows each take at most 30 s.

Why:

- A flush ran the whole find pipeline once per subscriber, argument
  parsing, read rules and `beforeFind` included: 43 % of a write's time on
  10 000 subscribers. The rights it computed are those the plan already
  holds, and point 10 already rebuilds the plan whenever a read of the
  caller or of a `beforeFind` changes, every 5 minutes and when the caller
  expires; a flush computed nothing a rebuild does not.
- A row a flush placed was read with the rights of that flush, while the
  rows already shown kept those of the plan: one window under two filters.
  A plan read once applies the same rights to every row it shows.
- A subscription read its rows twice, their ids first and then their
  fields with `id IN (…)` of every id: half the queries, and compiling a
  thousand ids cost a tenth of a subscription's time.
- A row followed by 1000-row windows held 320 B: its id twice, an array of
  keys and an empty record of the relations it does not follow.

Rejected:

- Windows shared between subscribers of one list: each caller's rights are
  a filter of its own (`owner in [their id, 'all']`), so sharing needs
  proving two filters keep the same rows, and a wrong proof leaks rows.
  Point 1 removes most of a subscriber's cost without it; the benchmark
  calls for it again if the targets of point 4 are not met.
- Running the read rules and `beforeFind` on a flush only for a row new to
  the window: still one plan per subscriber per write, for the same
  rights.

## D-196: A lost right re-checks only the rows it may reach

Choice: amends D-154 points 8, 9 and 10.

1. A delete tells, beside each deleted row's id, the stored `one` keys the
   row held, read from the delete's own result: still no row is loaded for
   the feed, and a model without a stored `one` key tells its ids alone.

   ```ts
   // Before
   { kind: 'delete', model: 'Member', ids: ['m1'] }
   // After
   { kind: 'delete', model: 'Member', ids: ['m1'], keys: { team: ['t1'], user: ['u7'] } }
   ```

   `keys` lists each key's values in the order of `ids`, `null` for a
   row without a target, and is absent when `ids` is. On PostgreSQL a
   notification of a delete then holds `150 / (1 + keys)` rows.

2. A row written at a level of a filter, the rows a relation reaches, is
   judged by that level's own conditions, those its stored fields answer:
   at a level that is not negative (D-154 point 9), a row that fails them
   before and after the write makes no row above pass or fail.
   - An inserted or linked row is judged as stored after the write; a row
     updated in a field the conditions read is judged before the update
     by its fields the update left.
   - A deleted row is judged by its id and its keys when the conditions
     read nothing else, and may pass them otherwise.
3. A live read makes window rows candidates for a link lost at a level, by
   a delete or by a change of the key the target stores, only when one of
   the rows that lost it may pass the level's conditions by point 2. A
   negative level reads the window again, as before.
4. A recorded read (D-154 point 10) whose `where` reads another row is
   stale only when a row written at one of its levels may pass that level's
   conditions by point 2. A link at the root's relation that the root does
   not store is judged at the level it leads to, not as a change of the
   root's found rows.

Why:

- Every write at a level re-checked every subscriber that reads through
  it. The benchmark (`bench/realtime/rights.ts`, 10 000 subscribers) gave,
  for a member row deleted, 10 000 to 20 000 statements and 3.4 s to 63 s
  of work, and for a user leaving a role, 10 000 statements and 6.7 s,
  while one subscriber alone lost rows.
- A subscriber's level conditions name it (`user: me`): the row written
  names another one, which its own fields tell without a read. An update
  or an insert loads that row once per flush already; a delete's row is
  gone, and its keys are what membership rows are made of.
- A role's members change as a link, which reads as an update of the role
  too: the role's id, found by every member's read, made each one stale.

Rejected:

- The deleted rows whole in the feed: a row can be long, and a
  notification holds 8 000 bytes. Its keys are ids.
- A shared query for the window rows that reached a former target: it
  still checks every window for a membership told by a text field, and
  reads every row of a large team. A membership told by a key needs none.
- Judging a negative level: a row failing an `every` condition makes the
  row above fail, so its loss may add a row.

## D-197: The live write target set by the measured run

Choice: amends D-195 point 4.

1. The last message of a write followed by 10 000 subscribers on one list
   of 25 rows arrives within 160 ms (p50), not 150.
2. The run of 2026-11-01 (`bench/realtime/README.md`, 157 ms, 167 B a row,
   28.5 s) meets point 4 so amended and closes the roadmap item with
   D-196's run of lost rights. Windows shared between subscribers are not
   called for.

Why:

- The run missed 150 ms by 7 ms, under 5 %, while every other target was
  met: 157 ms against 230 before
  D-195, 167 B against 320, 28.5 s against 54.
- What is left of a flush is each subscriber's own work, its rights
  checked in memory. Sharing windows, the next step D-195 names, needs a
  proof that two callers' filters keep the same rows, where a wrong proof
  leaks rows; 7 ms does not pay for that risk.

Rejected:

- Keeping 150 ms and sharing windows: the risk D-195 rejected it for, for
  a gap no subscriber sees.
- Keeping 150 ms and leaving the item open: a target no planned work
  reaches only stalls the phase.

## D-198: password's email flows as commands

Choice: completes D-117 and D-162, and amends D-113 point 7.

1. Six commands on the user model, beside `signUp`, `signIn`,
   `setPassword` and `checkPassword`:
   - `User.requestPasswordReset({ email }, options)`;
   - `User.resetPassword({ token, password }, options)`;
   - `User.verifyEmail({ token }, options)`;
   - `User.sendVerificationEmail({ id }, options)`;
   - `User.requestEmailChange({ id, newEmail }, options)`;
   - `User.confirmEmailChange({ token }, options)`.

   Each resolves `undefined` once its work is done, and runs the code its
   function runs (D-117, D-162): the same tokens, emails, checks and errors.

2. Callers. A command keeps its function's access. Those whose function is
   public take any caller: a token, or the inbox a link goes to, is the
   proof. Those whose function needs a signed-in user name the user by `id`
   and run as Master or as that user, as `setPassword` does; any other
   caller fails with `ACCESS_DENIED`.
3. Commands have no client: no address limit and no attempt is counted, as
   `User.signIn` (D-113). The account's three emails per hour still apply:
   past them, a command fails with `TOO_MANY_ATTEMPTS`,
   `requestPasswordReset` included.
4. A command waits for its email. It resolves once `sendEmail` has
   resolved, and rejects with its error: server code, and a test, know
   the email left. `requestPasswordReset` with an email without an account
   sends nothing and resolves; it does not tell server code apart from the
   function's answer.
5. `requestEmailChange` takes no current password, as `setPassword` takes
   none: server code checks the user's intent first, with
   `User.checkPassword` when it holds the password. A taken email fails
   with `UNIQUE_VIOLATION` and the user's `email` in its details.
6. Without `sendEmail`, the commands that send an email throw an `Error`,
   `User.requestPasswordReset needs passwordPlugin({ sendEmail }).`: the
   types cannot depend on an option, and it is the application's mistake.
   The token commands need no option: without emails no token exists, and
   they fail as with a wrong token.
7. No `changePassword` command: `checkPassword` then `setPassword` is it.
   No command for auth's `signOut`, which `User.revokeSessions` covers, nor
   for `viewer`, since server code holds the user.

Why: server code and tests reach a flow from the model as they reach the
rest, with `asUser(record)` and Master; posting GraphQL for one flow made
tests and admin functions reimplement tokens or go through HTTP. Waiting
for the email is what server code wants, while the function answers
before it for the client's sake. Naming the user by `id` is how server code
acts for one, as every other user command.
Rejected:

- exporting the functions as values with their `run` (issue's first shape):
  a plugin's functions are built from its options when the application
  starts, so an exported value would look the running plugin up, and the
  signed-in functions would need a forged caller to name a user;
- the current password on `requestEmailChange`: server code proves intent
  its own way, as with `setPassword`;
- Master only: an application acting as the user gets its rules, as with
  `setPassword`;
- returning whether an email left: server code that needs it reads the
  user, and `requestPasswordReset` would differ from its function.

Example, before:

```ts
// A test, or an admin function, posts GraphQL.
await fetch(`${url}/graphql`, {
	method: 'POST',
	body: JSON.stringify({
		query:
			'mutation ($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }',
		variables: { input: { email: 'ada@example.test' } },
	}),
})
```

After:

```ts
await User.requestPasswordReset({ email: 'ada@example.test' })
await User.resetPassword({ token, password: 'new secret!' })
await User.sendVerificationEmail({ id: user.id }, { as: master })
await User.verifyEmail({ token })
await User.requestEmailChange(
	{ id: user.id, newEmail: 'ada@new.example' },
	{ as: { kind: 'user', user } },
)
await User.confirmEmailChange({ token })
```

## D-199: A field a read rule may hide is optional in reads

Amended by D-203.

Choice: amends D-44.

1. A field with a read rule is optional in the rows a query returns:
   `findMany`, `findFirst`, `findUnique`, `paginate`, a `select` and an
   `include`, at any depth, and a function's output that returns such a
   row. `allow.private` is a read rule here. `allow.public` and
   `allow.readOnly` are none (D-176), so their field stays required.
2. It is optional for every caller, Master included.
3. A hook's or a rule's `record` keeps every field: it is the stored row,
   not what a caller reads.
4. A virtual hidden by its own read rule or by a need's, and the `_count`
   of a hidden relation, stay typed as present.
5. `allow.public` and `allow.readOnly` carry a type-only mark, which the
   field's `.with` reads to type the field. The kernel still tells them by
   identity (D-176).

Why:

- A read rule leaves the field out of the rows it refuses (D-44), yet the
  type said the field was always there. An application migrating from
  Parse called `post.title.trim()` on a row that had no `title`, and it
  failed at run time, not in the editor.
- `{ as: caller }` takes a caller whose kind the types do not know, so they
  cannot tell Master's rows from a user's. Knowing it would make every
  query generic in its options, which costs on every query of every model.
- Measured on the 200 generated models with rules: 3.6 % more
  instantiations and 82 ms more on a query edit; 1.7 % more without rules
  (`bench/typing/README.md`).

Rejected:

- Optional only for a caller other than Master: see the second reason.
- Typing a hidden field `T | null`: the row leaves the key out, it does not
  set it to `null`.
- Covering virtuals and `_count`: a virtual's needs are known only once
  the model is typed, the cycle D-44 avoids.

Example, before: the row's type says `title` is there.

```ts
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		status: f.enumOf(['draft', 'published']),
		title: f.string().with<{ status: 'draft' | 'published' }>({
			access: { read: ({ record }) => record.status === 'published' },
		}),
	}),
})

const post = await Post.findFirst({ where: { id } }, { as: caller })
post?.title.trim() // compiles; throws when the rule hid `title`
```

After: the row says `title` may be missing.

```ts
const post = await Post.findFirst({ where: { id } }, { as: caller })
post?.title?.trim() // `title` is `string | undefined`
```

## D-200: A private file's URL stays the same for 15 minutes

Choice: amends D-152 points 3 and 7.

1. `s3()` signs a private file's read URL with the start of its
   15-minute window of UTC time, not the time of the read, and an expiry
   of 30 minutes: every read in one window returns the same URL, valid 15
   to 30 minutes from the read.
2. The window is fixed: no option. Uploads, deletes and listings keep
   their 15-minute presigns from the time of the request.
3. `memoryFiles()` gives a private file `memory://files/<key>?expires=1800`,
   the same at every read.
4. A public file's URL stays as it is: stable, not signed.

Before, the same row read twice, a minute apart:

```ts
const a = await Post.findUnique({ where: { id } }, { as })
const b = await Post.findUnique({ where: { id } }, { as })
a.cover.url // …&X-Amz-Date=20261102T101203Z&X-Amz-Expires=3600&…
b.cover.url // …&X-Amz-Date=20261102T101307Z&X-Amz-Expires=3600&…
```

After:

```ts
a.cover.url // …&X-Amz-Date=20261102T100000Z&X-Amz-Expires=1800&…
b.cover.url // the same string
```

Why:

- A live read sends a row again when something else in it changed. A new
  signature then changes every file URL in the row: the client downloads
  the images again, since the URL is their cache key, and a form or a
  component keyed by the value resets.
- A URL is computed while the read decodes (D-152), with no storage call
  and no cache: the window keeps that.
- A URL is still valid at least one full window after the last read that
  gave it, so a client that keeps it for its window never holds an expired
  one.

Rejected:

- A `/files/<key>` route that checks read access and redirects to a fresh
  presigned URL: a route, a read per image, and its own access rules, for
  a URL that S3 checks already.
- An option for the window: no application asked for another one.
- One-hour windows: with the two-window expiry, a leaked URL would work up
  to two hours, twice as long as today.

## D-201: `ultimabase generate` writes the plugins' generated files

Choice: amends D-191 points 1, 2 and 6.

1. A plugin declares the files it generates with `generate`: it receives
   its context once every plugin's `api` is built, and returns
   `{ path, content }[]`. A path is read from the current directory.
2. `ultimabase generate` loads the config and the `.env` beside it, as
   `dev` does, and builds the plugins' APIs without starting the
   database, opening a port, or running any `start`. It writes each file
   whose content differs, creating missing folders, and prints
   `Wrote <path>.` for each; nothing when every file is current.
3. `ultimabase generate --check` writes nothing. It prints
   `<path> is out of date.` for each file that differs or is missing, and
   exits 1 when one does.
4. `ultimabase dev` writes them the same way each time the application
   starts, after the plugins' `start`, and logs `Wrote <path>.`. Only
   `NODE_ENV=development` writes: not `start`, nor tests.
5. `graphqlPlugin({ generated })` becomes the GraphQL plugin's `generate`:
   one file, the served schema as SDL, `extend` applied. GraphQL writes
   nothing itself.
6. A path given twice, by two plugins or by one, stops the command and
   `dev`: `src/x.graphql is generated twice, by graphql and docs.`
7. The command sets `NODE_ENV` to `development` when it is unset, as `dev`
   does, so a plugin builds what `dev` would write.

Before, a client developer after a pull, and CI:

```sh
docker compose up -d postgres
npx ultimabase dev   # writes src/generated/schema.graphql, then Ctrl-C
# CI: nothing checks the committed file
```

After:

```sh
npx ultimabase generate
# Wrote src/generated/schema.graphql.

npx ultimabase generate --check   # in CI
# src/generated/schema.graphql is out of date.   (exit 1)
```

A plugin's own file:

```ts
definePlugin<Docs>({
	name: 'docs',
	generate: ({ models }) => [
		{ path: 'docs/models.md', content: tableOf(models) },
	],
})
```

Why:

- The generated files depend on the models, the functions and the
  plugins' options, which the config holds: building them needs neither a
  database nor a port. A client developer refreshes them without the
  backend running, and CI checks them.
- A stale committed schema was seen: a model change merged without a
  `dev` run left the file behind until a client query failed (D-191
  rejected a check until then).
- The CLI knows no plugin: it runs each plugin's `generate`. The APIs are
  already built before any `start` (D-107), so the step exists.

Rejected:

- `ultimabase graphql schema`: the CLI would know GraphQL (D-191).
- Writing from a plugin's `api`: it runs in tests and in production too.
- Connecting to the database to build: CI and a client developer would
  need one.
- An asynchronous `generate`: no file needs I/O to be built today.

## D-202: `memoryFiles()` and `diskFiles()` are served by the application

Choice: amends D-152 points 1 and 5.

1. A storage may serve its objects itself: the files plugin then mounts
   `GET /files/<key>`, and a file's URL is that route's. `s3()` does not:
   its URLs stay the bucket's (D-152, D-200).
2. `memoryFiles({ servedAt })` is served. `servedAt` is the origin a
   client reaches the application at; it defaults to the HTTP server's
   address, `http://localhost:3000`.
3. `diskFiles({ dir, secret, servedAt })` stores each object in `dir` as
   `<key>` and its type in `<key>.json`, written to a temporary name then
   renamed, so a half-written file is never served. `secret` signs the
   private URLs, 32 characters at least. It is for one server whose `dir`
   outlives a deploy, as a Docker volume: a preview, a staging server, a
   small application.
4. A private file's URL is signed:
   `/files/private/<id>?expires=<seconds>&signature=<HMAC-SHA256>`, with
   the window and the expiry of D-200, so it stays the same for 15
   minutes. `memoryFiles()` draws its secret at start. A signature that
   does not match, or has expired, gets 403; a missing object 404.
5. The route answers with the stored type, `X-Content-Type-Options:
nosniff` and `Content-Security-Policy: sandbox`, and `Content-Disposition:
attachment` where D-152 sets it. A public file is cached for a year, as
   its key never changes; a private one until its URL expires.

Before, a front end's tests, and a staging server without S3:

```ts
filesPlugin({ storage: memoryFiles() })
post.cover.url // 'memory://files/public/3f2a…': no browser loads it

filesPlugin({ storage: s3({ bucket, endpoint: 'http://garage:3900', … }) })
// another service to run, with its keys
```

After:

```ts
filesPlugin({ storage: memoryFiles() })
post.cover.url // 'http://localhost:3000/files/public/3f2a…'

filesPlugin({
	storage: diskFiles({
		dir: '/data/files',
		secret: process.env.FILES_SECRET,
		servedAt: 'https://staging.example.com',
	}),
})
post.cover.url // 'https://staging.example.com/files/public/3f2a…'
avatar.url // '…/files/private/9c1e…?expires=1793612400&signature=…'
```

Why:

- A front end's tests upload and show files: with `memory://` URLs they
  need an S3 emulator, which no test should write to.
- A staging server often has no S3, and an S3-compatible service is one
  more process, its keys and its volume, for a disk the server already
  has. D-152 dropped `local()` because a disk is lost when its server is
  replaced: a volume is not, and the limits are written where the storage
  is documented.
- D-152 serves files from the storage's origin so a file cannot read the
  application's cookies. `sandbox` gives the response an origin of its
  own even when it is opened, `nosniff` keeps its declared type, and the
  types a browser runs stay downloads.
- D-200 rejected a route that redirects to S3: a request per image for a
  URL S3 already checks. Here the route is the only way to the bytes.

Rejected:

- `databaseFiles()`: the bytes would grow the database and its backups,
  and every read would hold a connection.
- Serving `s3()` through the application: its URLs already work.
- A random secret for `diskFiles()`: a restart would break every private
  URL a client holds.
- `Range` requests and `ETag`s: no application asked for them; a video
  belongs in S3.

## D-203: `asUser` takes the user's row as a read gives it

Choice: amends D-80 and D-199.

1. `asUser(user)` takes the registered user model's row as a read gives
   it, `UserRowOf<Register>`: a field a read rule may hide is optional
   there (D-199). `caller.user` keeps every field, as the caller a session
   gives holds the row a Master read returned.
2. `ultimabase` exports `UserRowOf<R>`, next to `UserOf<R>`, and `Hidden`,
   the mark a plugin's declared `addedFields` puts on a field with a read
   rule, so that reads type it as optional too. password marks `email` and
   `passwordSetAt`.

Why:

- D-199 types a read-ruled field as optional in every read, Master's
  included, so no row a test reads fits `asUser` any more: D-80's own
  example stopped compiling. Once password's `email` is marked, every
  application that signs in with a password would hit it.
- A sign-up's and a Master read's rows hold every field at run time.
  Before D-199, `asUser` already took a row another user had read, so
  taking the read row is no less safe than 0.3.
- A plugin writes its `addedFields` type by hand, and the kernel cannot
  read a rule from it: password's `email` was typed as always present,
  though another caller's row leaves it out.

Rejected:

- Completing `caller.user` from the database when the caller acts: a read
  per caller for a problem of types alone.
- An async `asUser(id)` that reads the user as Master: every test waits,
  and `@ultimabase/testing` would need the running application.
- Master's reads keeping read-ruled fields required: D-199's second
  reason.
- Typing `caller.user` as the read row: every rule reading the user's own
  field, such as `caller.user.email`, would handle an `undefined` a
  session never gives.
- The kernel refusing an `addedFields` type without the mark: `definePlugin`
  would be generic over the callback's result.

Example, before: the row a sign-up returns does not fit `asUser`.

```ts
const User = defineUser({
	name: 'User',
	use: [password()],
	fields: (f) => ({
		name: f.string(),
		phone: f.string().with({ access: { read: isSelf } }),
	}),
})

const ada = await User.signUp(
	{ email, password, data: { name: 'Ada', phone } },
	{},
)
await Post.findMany({}, { as: asUser(ada) })
// TS2345: Property 'phone' is optional in type '…' but required in type '…'.
```

After: it does, and another user's read says `email` may be missing.

```ts
await Post.findMany({}, { as: asUser(ada) })

const bob = await User.findUnique({ where: { id } }, { as: asUser(ada) })
bob?.email // `string | null | undefined`
```

## D-204: `/health` and `/ready`, and a drain before the stop

Amended by D-207 and D-223.

Choice: amends D-91 and D-106.

1. `httpPlugin` answers `GET /health` and `GET /ready` (and `HEAD`) before
   every other route: no caller is read, no CORS applies, and the
   application's routes cannot take them.
2. `/health` answers 200 `{ "status": "ok" }` whenever the server answers,
   starting and stopping included. It reads nothing.
3. `/ready` answers 200 `{ "status": "ok" }` once the application started,
   while it is not stopping and every readiness check passes; otherwise 503
   `{ "code": "UNAVAILABLE", "message": "…" }`, its message saying which.
4. `http.ready(check)`, called from a plugin's `api`, adds a check:
   `() => boolean | Promise<boolean>`. `/ready` runs them all on each
   request; a check that throws fails, logged with its error.
5. Two plugin hooks, around `start` and `stop`:
   - `started(context)`: once every plugin's `start` ran, in the same
     order, before `Application started.`. It returns nothing.
   - `stopping(context)`: when `stop` begins, before any plugin's `stop`,
     every plugin's at once; `stop` waits for them all. One that throws is
     logged, the stop goes on, and `stop` rejects with the first error, as
     a failing `stop` (D-91 point 4).
6. http's `stopping` makes `/ready` answer 503, then waits `drain`
   milliseconds while the server serves as before:
   `httpPlugin({ drain })`, 5000 by default under `NODE_ENV=production`,
   0 otherwise. A second `SIGTERM` still ends the process at once.

Why:

- A container platform restarts an instance whose liveness check fails,
  and a load balancer sends traffic only to one whose readiness check
  passes. Each application wrote both routes, and could not know when the
  plugins had all started, nor when the stop began.
- http listens in its own `start`, as a plugin's `start` may read
  `http.url()`: a plugin started after it, or a request it serves, may
  not be ready yet. `/ready` waits for `started`.
- On `SIGTERM`, the instance used to close its server at once, while the
  load balancer still sent it requests: they met connection errors. The
  drain gives the load balancer the time to read `/ready` and leave the
  instance first.
- The drain must come before any plugin's `stop`: a transport stops
  before http, which it needs (D-91 point 1), and would refuse requests
  still routed to the instance.
- Liveness stays 200 while the application starts: a slow start would
  otherwise make the platform restart it, again and again.
- In development and tests a stop is immediate: no load balancer waits.

Rejected:

- A database check in `/ready`: when the database fails, every instance
  leaves the load balancer at once, and an outage becomes a total one; a
  plugin that wants it adds its own check.
- A `health` query in GraphQL, as Parse's: a load balancer sends a `GET`
  and reads the status, and a GraphQL error still answers 200; a client
  reads `/health` from the same server.
- Configurable paths, and an option to turn the routes off: nobody needs
  other paths, and an application's own `/health` is the one these
  replace.
- `Retry-After` on `/ready`'s 503: load balancers retry on their own
  schedule.
- The drain in the kernel, as an option of `defineApp`: without http,
  nothing would read it.
- A state the kernel exposes, `context.state()`, instead of the hooks:
  http would still need to wait the drain before the other plugins stop.

Example, before: the application writes the routes, and `/ready` answers
200 until the server closes.

```ts
httpPlugin({
	routes: [
		routes()
			.get('/health', (c) => c.text('ok'))
			.get('/ready', (c) => c.text('ok')),
	],
})
```

After: nothing to write. A plugin that waits for a service adds a check.

```ts
httpPlugin() // GET /health, GET /ready; drain: 5000 in production

// In a plugin that requires http:
api: ({ plugins }) => {
	plugins.http.ready(() => queue.connected)
},
```

## D-205: `@ultimabase/maintenance`, and the plugins' gates

Amended by D-207.

Choice: amends D-106 and D-166.

1. `http.gate(gate)`, called from a plugin's `api`, adds a gate, the type
   of D-166's `upgrade`. It runs on each request past CORS and the
   preflights, before the form check, the body limit, the caller and the
   routes; and on each WebSocket upgrade, after the application's
   `upgrade`. The gates run in the plugins' order; the first `Response`
   is the answer, with CORS's headers, and `undefined` lets it through.
   `/health` and `/ready` are answered before them (D-204).
2. A new package, `@ultimabase/maintenance`, exports
   `maintenancePlugin({ retryAfter })`. It requires http. `retryAfter` is
   in milliseconds, 60 000 by default.
3. While the maintenance is on, every request and upgrade but Master's
   answers 503, `Retry-After` in seconds, and:
   `{ "code": "MAINTENANCE", "message": "The application is under maintenance.", "details": { "retryAfter": 60 } }`.
   `/graphql` is no exception. As it begins, the sockets open close with
   1012 `Maintenance` (D-166).
4. `PUT /_ultimabase/maintenance` with `{ "enabled": true }` or
   `{ "enabled": false }` turns it on or off, with the master key only:
   403 `ACCESS_DENIED` for another caller, 400 `VALIDATION_FAILED` for
   another body. It answers `{ "enabled": … }`. It is never refused.
5. A plugin that requires maintenance reads `plugins.maintenance`:
   `lock()` and `unlock()`, which resolve once the state is stored, and
   `locked()`, this server's state.
6. The state is one row of the plugin's own model, `MaintenanceState`
   (D-110), which no transport exposes. Each server reads it as it starts,
   and again on a change of it and on `missed` (D-154): every server
   follows. When the row cannot be read, the server keeps its state and
   logs the error.
7. `/ready` stays as D-204 has it: the maintenance does not change it.

Why:

- An application coming from Parse turns maintenance on during a
  migration: its clients show a maintenance page, and no write lands
  while the data changes. With several servers, a switch held in memory
  turns one of them only.
- A plugin could neither answer before the routes, as the routes of the
  application come first, nor gate the upgrades, which only the
  application's `upgrade` did. `gate` gives both, past CORS so that a
  browser reads the refusal.
- Master passes: the migration's own scripts and the admin work while the
  clients wait.
- `/ready` at 503 would take every server out of the load balancer: the
  clients would meet the load balancer's error, not the maintenance's
  body.
- A client detects the maintenance with any request, as
  `query { __typename }`: 503 and `code === 'MAINTENANCE'`.

Rejected:

- A maintenance token besides the master key, a `startLocked` option, a
  list of paths it lets through, a CLI command, testing helpers and a
  `GET` of the state: nobody asked for them yet.
- The maintenance in http, as an option: an application without it would
  carry a model and a route it does not use.
- Tying `/ready` to the maintenance, for the reason above.
- A gate that reads the caller before it runs: every request would read
  it, sessions included, even when no gate needs it; maintenance reads it
  only while it is on.

Example, before: the application keeps a flag in memory, one server only,
and writes its own gate and route.

```ts
let locked = false
httpPlugin({
	upgrade: () => (locked ? new Response(null, { status: 503 }) : undefined),
	routes: [
		routes()
			.use(async (c, next) => {
				if (locked && c.var.caller.kind !== 'master') {
					return c.json({ code: 'MAINTENANCE' }, 503)
				}
				await next()
			})
			.put('/maintenance', async (c) => {
				locked = (await c.req.json()).enabled
				return c.json({ enabled: locked })
			}),
	],
})
```

After: every server follows one stored state.

```ts
plugins: [httpPlugin(), maintenancePlugin()]

// curl -X PUT /_ultimabase/maintenance \
//   -H 'x-ultimabase-master-key: …' -d '{ "enabled": true }'

// In a plugin that requires maintenance:
await plugins.maintenance.lock()
```

## D-206: Each plugin declares its codes, and `ErrorCodeOf<typeof app>`

Amended by D-231.

Choice: amends D-72 and D-107.

1. A plugin's types take `errors`, the union of the codes its errors carry
   beyond the kernel's `ErrorCode`, in capitals:
   `readonly errors: 'FORBIDDEN' | 'LENGTH_REQUIRED'`.
2. `ultimabase` exports the type `ErrorCodeOf<A>`: for `typeof app`, the
   kernel's `ErrorCode` and the `errors` of each plugin `app` lists. An
   application's own codes are not in it; a client adds them.
3. The plugins of this repository declare:
   - http: `BAD_REQUEST`, `BAD_USER_INPUT`, `PAYLOAD_TOO_LARGE`,
     `UNAVAILABLE`, `UNSUPPORTED_MEDIA_TYPE`;
   - files: `FORBIDDEN`, `LENGTH_REQUIRED`, `PAYLOAD_TOO_LARGE`,
     `UNSUPPORTED_MEDIA_TYPE`;
   - maintenance: `MAINTENANCE`;
   - every other plugin sends the kernel's codes, or those of a plugin it
     requires, as graphql sends http's `BAD_USER_INPUT`.
4. A document graphql-js refuses, as an unknown field, a depth over the
   limit or introspection in production, carries
   `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query (D-129).
   A request graphql-http cannot read, as a mutation over `GET`, stays
   without a code.
5. `scripts/codes.test.ts` reads each package's sources: every code its
   production code sends is the kernel's, its own declared one, or one of
   a package it depends on, and each code it declares is one it sends.
   `live`, `testing` and `create-ultimabase` are no server plugin, and are
   left out.

Why:

- An application coming from Parse keeps a table of messages, one for
  each code its client may receive. Typed against the codes the server
  may send, a code a new plugin adds, or one a plugin drops, fails the
  client's typing instead of showing a raw code.
- The codes are a plugin's, as its options and its API are: they travel
  with its types (D-24), from the application value, with no global
  declaration.
- A declaration nothing checks drifts: the script holds each plugin to
  the codes it sends.
- A client branching on the code of a refused GraphQL document read none:
  REST gave `BAD_USER_INPUT` for the same mistake.

Rejected:

- A global `Register` interface the application augments: D-24 allows no
  global declaration but the user model, and D-72 rejected a registry of
  codes.
- A runtime list of the codes: a client needs their type, and a list it
  imports would ship server code.
- `HTTP_<status>`, which an `HTTPException` with an unnamed status gives,
  in the union: no plugin sends one, and a client cannot list every
  status.
- `BAD_USER_INPUT` in the kernel's `ErrorCode`: the kernel throws
  `InvalidQuery`, and only a transport sends `BAD_USER_INPUT`; an
  application without http never meets it.
- `INVALID_QUERY` in the union: no transport sends it.

Example, before: the client lists the codes it knows by hand, and misses
those a plugin adds.

```ts
const messages: Record<string, string> = {
	NOT_FOUND: 'This page does not exist.',
	OUT_OF_STOCK: 'This product is out of stock.',
}
// MAINTENANCE, added with maintenancePlugin(), shows as a raw code.
```

After: the application's type lists them, and a missing one fails typing.

```ts
import type { ErrorCodeOf } from 'ultimabase'
import type { app } from './app.ts'

const messages = {
	NOT_FOUND: 'This page does not exist.',
	OUT_OF_STOCK: 'This product is out of stock.',
	MAINTENANCE: 'Back in a few minutes.',
	// … every other code
} satisfies Record<ErrorCodeOf<typeof app> | 'OUT_OF_STOCK', string>

// In a plugin's types:
interface Shop extends PluginTypes {
	readonly name: 'shop'
	readonly errors: 'CLOSED'
}
```

## D-207: A starting server serves nothing; the maintenance key and initial state

Choice: amends D-204 and D-205.

1. Until every plugin started (D-204 point 5), `httpPlugin` answers every
   request and upgrade but `/health` and `/ready` 503
   `{ "code": "UNAVAILABLE", "message": "The application is starting." }`,
   Master's included, before every gate and the application's `upgrade`.
   `/ready` keeps its own answer.
2. `maintenancePlugin({ key })`: a request sending the key in the
   `x-ultimabase-maintenance-key` header switches the maintenance with
   `PUT /_ultimabase/maintenance`, as the master key does, which is still
   accepted. The key opens nothing else: no gate lets it through, and
   every other route reads its caller as before. It is compared in
   constant time, on SHA-256 digests.
3. The key follows the master key's rules (D-49): an empty key is unset,
   and accepts no request; a space or a character outside ASCII refuses
   the start, and so does a key under 32 characters under
   `NODE_ENV=production`. A wrong key, like any other caller, answers 403
   `ACCESS_DENIED`:
   `Only the master key or the maintenance key turns the maintenance on or off.`
4. `maintenancePlugin({ initial })`, `'locked'` or `'unlocked'` (the
   default), is the state while no row is stored, at the start and after
   a read that finds none. A stored row always wins, and the start writes
   nothing. Another value refuses the start. The plugin reads no
   environment variable: the application passes it, as it does the keys.
5. A start that cannot read the row fails: `start` rejects with the
   database's error. Once started, a failed read keeps the state (D-205
   point 6).
6. `/ready` stays 200 during the maintenance (D-205 point 7).

Why:

- http listens in its own `start` (D-204), and maintenance read its row in
  its own, after: a request in between met the maintenance off, and
  routes whose plugins had not started. During a deployment under
  maintenance, a new instance served its first clients.
- Master too waits: a plugin may not be ready for it either, and the
  window lasts only the start.
- A deployment pipeline locks the application before a release and
  unlocks it after its checks. With the master key, a leak of its secret
  reads and changes every row; the maintenance key switches the
  maintenance only.
- A first deployment, or a database restored, holds no row: such an
  application must start under maintenance, without a server writing a
  state another one may have set.
- A server that cannot read the state at start must not guess: serving
  could expose a migration in progress. A failed start makes the platform
  try again.
- D-205 left out a maintenance token and a `startLocked` option as nobody
  asked for them: an application now does.

Rejected:

- Keys limited to given routes, for any plugin: one route needs one today.
- Writing `initial` as the row at start: a server starting with another
  `initial` would overwrite the state a pipeline set.
- The key letting a request through the maintenance: the pipeline only
  switches it; its own checks use the master key or a user.
- Letting Master through while starting, as maintenance does: a plugin
  that has not started may not answer it right.
- Starting unlocked when the read fails: it fails open.
- `/ready` at 503 during the maintenance, for D-205's reason.

Example, before: the pipeline holds the master key, and a fresh database
starts open.

```ts
plugins: [httpPlugin(), maintenancePlugin()]

// curl -X PUT /_ultimabase/maintenance \
//   -H "x-ultimabase-master-key: $MASTER_KEY" -d '{ "enabled": true }'
```

After: the pipeline holds a key that switches the maintenance only, and a
fresh database starts locked.

```ts
plugins: [
	httpPlugin(),
	maintenancePlugin({
		key: process.env.MAINTENANCE_KEY,
		initial: process.env.START_LOCKED === '1' ? 'locked' : 'unlocked',
	}),
]

// curl -X PUT /_ultimabase/maintenance \
//   -H "x-ultimabase-maintenance-key: $MAINTENANCE_KEY" -d '{ "enabled": false }'
```

## D-208: A transaction ends once its queries settle

Choice: amends D-36.

1. A transaction sends its `ROLLBACK` or its `COMMIT` only once every
   query in it has settled. A failed query still rolls all of it back, and
   `transaction` still rejects with the first failure, a `Conflict` that
   runs a serializable one again included (D-179).
2. A model's query belongs to the open transaction from its call, before
   its first statement: one the callback starts without waiting for it
   holds the transaction until it settles, and its failure rolls it back.

Why:

- A connection runs one statement at a time. When a query failed beside
  others of a `Promise.all`, the rollback went out while they still waited
  on the connection: `pg` 8 queues it and warns, pg@9 refuses it, and the
  transaction ended under code still reading in it.
- A query the callback did not wait for began after the callback
  returned: it ran after the commit, on a transaction already ended.

Rejected:

- Cancelling the pending queries: PostgreSQL cancels a statement only from
  another connection, and the queries end soon once one failed, as no new
  one runs (D-88).
- Waiting only before a rollback: a commit beside a pending read has the
  same race.

Limit: a query that never settles holds its transaction open, and the
connection with it. A query started from a timer once the transaction
ended is not held by it.

Example, before: the failed `create` rolls back while the reads still wait
on the connection.

```ts
await transaction(async () =>
	Promise.all([
		User.create({ data: { username: 'ada' } }, M), // UNIQUE_VIOLATION
		User.findMany({}, M),
		User.findMany({}, M),
	]),
)
// pg: DeprecationWarning: Calling client.query() when the client is
// already executing a query is deprecated...
```

After: the same code rejects with `UNIQUE_VIOLATION` once both reads
settled, then rolls back; `pg` warns of nothing.

## D-209: Breached passwords, and a password that is the email

Amended by D-224.

Choice: amends D-113.

1. `passwordPlugin({ breached: true })` refuses a new password that
   appears in a known data breach, with Have I Been Pwned's range API:
   the plugin sends the first 5 characters of the password's SHA-1 and
   reads the matching suffixes, with padding; no package. It checks on
   sign-up, `changePassword`, a reset and `User.setPassword`, Master's
   included, never on a sign-in. It is off by default: without the
   option, the plugin calls no third party.
2. When the service does not answer within 2 seconds, or answers an
   error, the password is accepted and the logger warns: an outage of a
   third party does not close sign-up.
3. The check is skipped when `NODE_ENV` is `test`, as Vitest and Jest set
   it: an application's tests call no third party, and a test password
   needs no care.
4. In production, a start without the `breached` option logs one warning:
   `Breached passwords are accepted: passwordPlugin({ breached: true })
refuses them.` Writing `breached: false` silences it.
5. A new password equal to the account's email, or to the part before its
   `@`, ignoring case, is refused, with or without `breached`. A change and
   a reset compare it with the user's current email.
6. A reset checks the new password before it uses the link: a refused
   password leaves the link valid for another try.
7. A password still has 8 to 256 characters (D-113). The documentation
   says that NIST SP 800-63B rev. 4 asks for 15 when the password is the
   only factor, and that OWASP ASVS 5 keeps 8 as its minimum.

Both refusals are `VALIDATION_FAILED`, with the issue on the password's
input field (`password`, or `newPassword` for `changePassword`):
`password: This password appears in a data breach: choose another.` and
`password: A password cannot be the email.`

Why:

- A list of the most common passwords is a part of the breached ones:
  one check covers both, with no list to ship and keep current.
- k-anonymity sends 5 hexadecimal characters, shared by hundreds of
  hashes; padding hides the answer's size. The password never leaves the
  server.
- A third-party call is the application's choice to make, as Auth0 and
  Supabase ask it; the production warning makes the default a choice too.
- The email check needs no service and refuses the first password an
  attacker tries with an email in hand.

Rejected:

- A list of common passwords in the package: the maintained ones weigh
  2 to 9 MB, and a short one misses what the breach check finds.
- The `hibp` package: it would save some fifteen lines, and adds a
  dependency (D-92).
- On by default: a library that calls a third party unasked surprises
  the application and its privacy policy.
- Refusing the password when the service fails: an outage would close
  sign-up and every change.
- A strength meter (zxcvbn): NIST advises against composition rules, and
  the breach check refuses the guessable passwords.
- A minimum length option: 8 stays the floor, and an application that
  wants more checks the length in its own form.

Limit: the check depends on the service's availability, and sends the 5
characters to it on each new password. A password already stored is not
checked again.

Example, before: any 8 characters are accepted.

```ts
passwordPlugin({ signUp: ['name'], sendEmail })

await User.signUp(
	{ email: 'ada@example.com', password: 'password123', data: { name: 'Ada' } },
	{ as: master },
) // created
```

After: the application turns the check on, and the sign-up is refused.

```ts
passwordPlugin({ signUp: ['name'], sendEmail, breached: true })

await User.signUp(
	{ email: 'ada@example.com', password: 'password123', data: { name: 'Ada' } },
	{ as: master },
)
// VALIDATION_FAILED: password: This password appears in a data breach:
// choose another.

await User.signUp(
	{
		email: 'ada@example.com',
		password: 'Ada@Example.com',
		data: { name: 'Ada' },
	},
	{ as: master },
)
// VALIDATION_FAILED: password: A password cannot be the email.
```

## D-210: Prettier checks with its cache

Choice: amends D-173. `yarn format:check` runs `prettier . --check --cache`:
Prettier checks again only the files changed since its last run, and keeps
its cache in `node_modules/.cache`. D-173's 90 seconds hold for a run after
another, the way a change is validated; the first run after an install, and
CI's, check every file.
Why: `yarn validate` reached 89 seconds (2173 tests, against 1916 when D-173
was taken), with no slow step: growth, not a regression. Prettier took 15.6
seconds, about 12 ms a file; with its cache a second run takes 2.9.
Rejected: 120 seconds (D-173 rejected two minutes: the run would drift
unseen); another formatter (a dependency to replace a flag).
Limit: a change of Prettier's version or options checks every file again,
which Prettier's cache does by itself.

## D-211: No closing an account

Choice: replaces D-160, and amends D-162 point 2 and D-169 points 3 and 5.

1. auth removes the command `User.closeAccount` and `AuthApi.onCloseAccount`;
   password removes its listener. An application that ends an account
   deletes the user: `User.delete` already ends the sessions, unlinks the
   accounts and deletes password's rows (D-111, D-113, D-117), so the email
   signs up again.
2. `email: null` on a user whose password account is linked is still
   refused, now with `email: A password account keeps its email.` (D-162
   point 2): nothing else unlinks it.
3. `passwordSetAt` is `null` only for a user without a password (D-169):
   nothing sets it back.
4. D-113 point 12 reads as D-162 left it: `AuthApi.unlinkAccount` unlinks
   one account.

Why: D-160 was taken for an application migrating from Parse that kept the
rows of closed accounts; it deletes them instead, as a member list need not
show an author who left. Nothing else used the command, and keeping it cost
a case the audit of auth found: inside an application's transaction, the
second `revokeSessions` ran before the commit, so a sign-in in between kept
a working session. Removing it before 1.0 is a minor change (0.x).

Rejected: fixing the nested case with an after-commit step (a kernel hook
for one command no one uses); keeping it behind an option (no speculative
options).

Example, before:

```ts
await transaction(async () => {
	await User.closeAccount({ id }, { as: master })
	await User.update(
		{ where: { id }, data: { name: 'Deleted account' } },
		{ as: master },
	)
})
```

After:

```ts
// Ends the sessions and deletes the password and the linked accounts.
await User.delete({ where: { id } }, { as: master })
```

## D-212: A new password ends the links and sessions of the old one

Choice: amends D-113 point 11 and D-117 point 5.

1. Setting a password deletes the user's pending reset and email-change
   links: one asked for with the old password dies with it. A verification
   link stays: it proves the same email, whatever the password.
2. A reset or verification link works only while the account's email is
   the one it went to. A link sent to an email the account has left fails
   as a used one, `INVALID_CREDENTIALS`, and is used up.
3. A sign-in that read the old stamp is ended once the write of the new
   password commits, by password's `afterUpdateCommit` hook on the user,
   rather than right after `setPassword`: inside an application's
   transaction, the commit is the application's.

Why: the audit of password found three cases. Someone who knows the
password asks to move the email; the owner resets the password, yet the
link still moves the account. A link issued as the email changed went to
the old address but acted on the new one, verifying an email nobody
proved. And as with `closeAccount` (D-211), inside an application's
transaction the second `revokeSessions` ran before the commit, so a
sign-in in between kept a working session.

Rejected: deleting every link, the verification one too (it costs a new
email and protects nothing); a kernel `afterCommit` for plugins (the user's
commit hook already runs then); checking the stamp on every request (a read
per request, in auth, for a case the commit settles).

Example, before and after the same code:

```ts
await transaction(async () => {
	await User.setPassword({ id, password }, { as: master })
	await AuditLog.create({ data: { userId: id, action: 'password' } })
})
// Before: a sign-in with the old password while this ran kept its session.
// After: that session ends once the transaction commits.
```

## D-213: Only Master gives a role, from either side of the link

Choice: amends D-86 point 1 and D-123 point 2.

1. A `many` relation written from its other side passes this side's field
   rule too, as a `one` relation's moved key passes the target's rules
   (D-78). When `Post.tags` links, unlinks or `set`s a tag, the field rule
   of `Tag.posts` runs on each tag row the caller reads: `update`, with the
   tag as `record` and `value: { connect: [{ id: post }] }` or
   `disconnect`. A tag created to be linked runs its `create` rule. A
   refusal is `ACCESS_DENIED` naming `Tag`, `posts` and `via: 'Post.tags'`.
   The target model's own rules stay as D-124 point 5 says: linking a row
   reads it.
2. `defineRole` gives `members`, `inherits` and `inheritedBy` the rule
   `write: allow.private`. Only Master, so server code, gives or takes a
   role, from the role or from the user's `roles`; a client writes the
   role's own fields as its `access` allows.
3. Known and kept: the read of a caller's roles (D-123 point 4) follows
   five levels in one statement, so a graph where each role inherits many
   others reads that many rows to the power five; only Master writes the
   graph. A caller's roles read inside a transaction that rolls back stay
   on that caller until the request ends, as any value read in it.

Why: the audit of roles found that a user allowed to edit their own row
(`update: isSelf`) connected `roles` to Admin and became an Admin: the
user's side of a many-to-many passed the User rules alone, and the Role
side's rules never ran. The same held for any field rule on one side of a
many-to-many, written from the other.

Rejected: a documented field rule the developer adds to the user's `roles`
(forgotten, it makes anyone an Admin); the target model's `update` rule on
every link (a user could no longer tag a post with a read-only tag);
the role model's own `update` rule deciding who gives roles (a rule written
for the role's fields would also give its members); one query per level of
inheritance (D-123 rejected it: three statements instead of one for an
ordinary three-level hierarchy, on every request).

Example, before and after the same code:

```ts
const User = defineUser({
	name: 'User',
	fields: (f) => ({ name: f.string(), roles: f.many(() => Role) }),
}).with({ access: { read: isAuthenticated, update: isSelf } })

await User.update(
	{ where: { id: eve.id }, data: { roles: { connect: [{ id: admin.id }] } } },
	{ as: asUser(eve) },
)
// Before: Eve is an Admin.
// After: ACCESS_DENIED, Role update refused (field members, via User.roles).

// A function gives the role, after its own check:
if (!hasRole(caller, 'Admin')) throw new PublicError('ACCESS_DENIED', '…')
await Role.update(
	{ where: { id: admin.id }, data: { members: { connect: [{ id: userId }] } } },
	{ as: master },
)
```

## D-214: A write rule may return `where()`

Choice: amends D-76 and D-81; as PostgreSQL's row security, `USING` and
`WITH CHECK`.

1. A model's `create`, `update`, `delete` or `write` rule receives `where`,
   as a read rule does, and may return `true`, `false` or `where({ ... })`.
   A filter says which rows the caller writes:
   - `update`: the row matches it before the write and after it, so a task
     moved to another project matches there too;
   - `delete`: the row matches it before the delete;
   - `create`: the created row matches it, its connected and its created
     relations included.
     It holds wherever the rule runs: `updateMany`, `deleteMany`, `upsert`,
     nested creates (D-128), nested updates (D-138) and relations written
     from the other side (D-78). Field rules stay boolean (D-44).
2. A row that does not match fails the whole write with `ACCESS_DENIED` and
   the details of D-82, as a rule returning `false`: the caller reads the
   row, so the refusal tells nothing a read does not. An `updateMany` over
   rows the filter leaves out is refused, never narrowed.
3. `where(filter, error)` throws `error`, a `PublicError`, when the row does
   not match, so a client learns why with its own code (D-206). Only a
   write rule's `where` takes it. A rule may also throw a `PublicError`
   itself, which the write throws as it is.
4. `allOf` checks each filter alone, each with its error; `anyOf` joins the
   filters with `OR` and fails with `ACCESS_DENIED`. One `where` with an
   `OR` inside gives its own error.
5. The filter is the rule's own, trusted as a read rule's (D-86): the read
   rules of the models it goes through do not narrow it. Master runs no rule.
6. Cost, only when a rule returns a filter: the check before is a count in
   the write's statement (D-99); the check after is a count once the write
   has run, in its transaction, since one statement does not see its own
   changes.

Why: "a task is edited by its project's owner" needed a rule that says
"any user" and two hooks that say the rest, a `beforeFind` for updates and
deletes and a `beforeCreate` that reads the project and throws by hand;
forgetting one opened the model, on every model under a parent.

Rejected: rows outside the filter left out of the write, as `beforeFind`
does (an `updateMany` would change fewer rows than asked, without a word,
while a `false` refuses); `NOT_FOUND` on a refusal (the row is readable);
a create filter on the connected relations only (narrower, and harder to
say than "the created row matches"); a message instead of an error (a
client needs a stable code); the check after in the write's statement
(PostgreSQL's parts of one statement do not see each other's changes).

Example, `examples/access-rules`, before and after:

````ts
// Before: the rule says "any user"; the hooks are the real rule.
access: {
	write: ({ caller }) => caller.kind === 'user',
},
hooks: {
	beforeFind: ({ caller, operation, where }) =>
		operation !== 'read' && caller.kind === 'user'
			? where({ project: { is: { owner: { is: { id: caller.user.id } } } } })
			: undefined,
	beforeCreate: async ({ caller, data }) => {
		// Reads the project as Master, throws ACCESS_DENIED by hand.
	},
}

// After
access: {
	write: ({ caller, where }) =>
		caller.kind === 'user' &&
		where(
			{ project: { is: { owner: { is: { id: caller.user.id } } } } },
			new PublicError('NOT_PROJECT_OWNER', 'Only the project owner edits its tasks.'),
		),

## D-215: Partial unique indexes

Choice: amends D-52.

1. A `unique: true` index of `defineModel` takes `where`, a filter in the
   query syntax narrowed to what every database indexes: each key names a
   scalar field of the model that is no list, `json` or plugin's field type,
   including a field a plugin adds, as `deletedAt`; `id`, `createdAt` and
   `updatedAt` are refused. A field takes a value, `null`, `{ equals }` or
   `{ not }`; several keys all hold. `OR`, `in`, relations and an empty
   `where` are refused, in the type and when the app starts.
2. `where` needs `unique: true` and no `contains`; it takes
   `mode: 'insensitive'`. A plugin's `addedIndexes` take no `where`.
3. The rows `where` keeps share no values; the rows outside it are never in
   conflict. `{ not: 'x' }` leaves out the rows that are `null`, as SQL's
   `<>`. A refused write is `UNIQUE_VIOLATION` naming the index's fields.
4. A partial index is no target of `findUnique`, `update` or `upsert`: it
   names no single row.
5. `postgres()` creates `unique index <table>_<columns>[_lower]_<hash>_key …
where …`, the hash being 8 characters of the predicate's. The snapshot
   keeps the predicate; a new `where` drops the index and creates it again.
   Rows that already break it fail the migration, with a `tries` message.
6. `memory()` checks the rows `where` keeps, as `postgres()` does.
7. The soft-delete plugin does not change: its documentation tells to write
   `where: { deletedAt: null }` for a value a deleted row gives back.

Why: an app moving from Parse keeps one open row per person (an attendance
not yet closed, a cart not yet paid) with a `beforeCreate` hook that counts
and refuses. Two concurrent requests both pass the count: only the database
holds the rule under concurrency, and an index only holds it when it can
leave out the closed rows.

Rejected: a hook or a check in a transaction (two transactions both pass it
under `read committed`); a raw SQL predicate (no `memory()` behaviour, no
type check, a different string per database); `OR`, `in` and relations in
`where` (beyond what a portable index states, for no case met yet); making
soft-delete add `deletedAt: null` to every unique index (a deleted row's
value given back is a choice of the app, not of the plugin); a partial index
as a `findUnique` target (several rows can share its value).

Example, before and after:

```ts
// Before: a hook two concurrent requests both pass.
export const Attendance = defineModel({
	name: 'Attendance',
	fields: (f) => ({
		person: f.one(() => Person),
		leftAt: f.dateTime({ optional: true }),
	}),
}).with({
	beforeCreate: async ({ data }) => {
		const open = await Attendance.count(
			{ where: { person: { id: data.person.connect.id }, leftAt: null } },
			{ as: master },
		)
		if (open > 0)
			throw new PublicError('ALREADY_OPEN', 'One attendance is open.')
	},
})

// After: the database refuses the second open row, UNIQUE_VIOLATION.
export const Attendance = defineModel({
	name: 'Attendance',
	fields: (f) => ({
		person: f.one(() => Person),
		leftAt: f.dateTime({ optional: true }),
	}),
	indexes: [{ fields: ['person'], unique: true, where: { leftAt: null } }],
})
````

## D-216: Deprecated fields and functions

Choice: completes D-150 point 3; amends D-122 and D-151.

1. Every field builder takes `deprecated`, a non-empty string that says why
   and what replaces it: the kernel's, `one`, `many`, `virtual` and a plugin
   field type's. `defineFunction` takes one too. It changes no behaviour: the
   field is read, written, filtered and sorted as before.
2. Only a field a client may leave out is deprecated: `optional`, with a
   `default`, a list, a `many` or a virtual. On a field a create must send,
   `deprecated` fails to compile and stops the start, as GraphQL refuses
   `@deprecated` on a required input and a client cannot stop sending it.
   Renaming a field makes the old one `optional`, or gives it a `default`,
   in the same change.
3. GraphQL shows `@deprecated(reason:)` on the model's type and its
   `Deleted` type, on the field in its `WhereInput`, `OrderByInput`,
   `CreateInput` and `UpdateInput`, on a virtual field, and on a function's
   query or mutation field.
4. OpenAPI shows `deprecated: true` on the property in the row, the filter,
   the sort and the data inputs, and on a function's operation. The reason
   ends the description, `Deprecated: Use displayName.`, after the
   description when there is one: OpenAPI has no field for it, and
   generated clients copy the description into their `@deprecated`.

Why: a field or a function a client should stop using needs a signal its
tools show: GraphiQL hides deprecated fields, editors strike them through,
and generated clients warn. A description says it in prose that no tool
reads.

Rejected:

- Deprecated enum values: a value is a plain string today, so marking one
  needs a new syntax, and OpenAPI cannot mark one value of an enum. Its own
  decision, when an application needs it.
- A deprecated model or type: GraphQL deprecates no type.
- The fields of a function's input and output: its Standard Schema says
  them in its JSON Schema (D-45).
- Counting the requests that touch a deprecated field: it inspects every
  selection, filter, sort and data on the hot path, for a signal the schema
  already gives. A development warning of the logger, once per field, would
  be its own decision.

Example:

```ts
// Before: a client learns from the description, if it reads it.
const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		displayName: f.string(),
		name: f.string({ optional: true, description: 'Old, use displayName.' }),
	}),
})

// After
const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		displayName: f.string(),
		name: f.string({ optional: true, deprecated: 'Use displayName.' }),
		// f.string({ deprecated: '…' }) fails: a create must send it.
	}),
})

export const legacySearch = defineFunction({
	name: 'legacySearch',
	deprecated: 'Use search.',
	// …
})
```

```graphql
type Person {
	displayName: String!
	name: String @deprecated(reason: "Use displayName.")
}
input PersonWhereInput {
	name: StringFilter @deprecated(reason: "Use displayName.")
}
type Query {
	legacySearch(input: LegacySearchInput!): [Person!]!
		@deprecated(reason: "Use search.")
}
```

## D-217: An application's commands on a model

Amended by D-225.

Choice: completes D-89; D-71 is unchanged.

1. `.commands<T>(build)` adds the application's commands to a model, as a
   plugin's `commands` adds its own (D-89): `Match.end(id)` next to
   `Match.update(…)`. It is called once, before or after `.with`, and
   returns the model with them. `build` receives `{ queries }`, the model's
   queries, and returns an object of functions; any other value, a nested
   object of functions included, is refused, as a command reads as one call.
2. `T` is an interface the application writes, with each command's
   signature and its comment. Without it, `build`'s return fails to compile
   on `name the commands type: .commands<MatchCommands>(...)`: a model whose
   commands' types are inferred from their bodies reads itself in its own
   type, which TypeScript refuses (TS7022) as soon as a command calls the
   model.
3. A command calls another of its model through the model's value,
   `Match.other()`; the interface types it.
4. A command runs on the server only: no transport serves it, and
   `defineFunction` stays the way a client calls code.
5. A command named after a model method, `with`, `nullable`, `paginated`,
   `paginate`, `commands`, a query, or after a plugin's command stops the
   definition: `Match.end: the application adds a command named after a
model method.`, `Match.end: soft-delete and the application both add
this command.` A plugin's command named `paginate`, `paginated` or
   `commands` is refused the same way, instead of being overwritten.
6. A command runs as the application's code: the application's hooks get
   no `command` (D-71).
7. The model stays frozen. A test runs the real command on the memory
   database rather than replacing it.

Why: an application's operation on one model, ending a match or closing an
order, sits in a file of loose functions that take the model's queries,
apart from the model they belong to. Parse's `Parse.Object.extend` gives
the class its methods; a command gives the model its own, without a
class.

Rejected:

- `.with({ commands })`: `.with`'s rules read the typed rows, and a generic
  in `.with` breaks the inference of the models that use it today.
- Commands typed by their bodies: TS7022 on every command that calls the
  model, the case that motivates them.
- A plugin per model to hold its commands: a plugin's name, manifest and
  installation for one application's code.
- Instance methods on a row (`match.end()`): a row is plain data, which the
  transports and live queries send as it is.

Example:

```ts
// Before: the model's operation lives apart from it.
export const Match = defineModel({
	name: 'Match',
	fields: (f) => ({ ended: f.boolean({ default: false }) }),
})
export async function endMatch(id: string): Promise<boolean> {
	const { count } = await Match.updateMany(
		{ where: { id, ended: false }, data: { ended: true } },
		{ as: master },
	)
	return count > 0
}
await endMatch(match.id)

// After
interface MatchCommands {
	/** Ends a running match: `false` when it had already ended. */
	end(id: string): Promise<boolean>
}
export const Match = defineModel({
	name: 'Match',
	fields: (f) => ({ ended: f.boolean({ default: false }) }),
}).commands<MatchCommands>(({ queries }) => ({
	end: async (id) => {
		const { count } = await queries.updateMany(
			{ where: { id, ended: false }, data: { ended: true } },
			{ as: master },
		)
		return count > 0
	},
}))
await Match.end(match.id)
```

## D-218: `httpPlugin()` limits each address's requests

Amended by D-230.

Choice: amends D-56; D-113 is unchanged.

1. `httpPlugin()` counts each client address's requests and upgrades in
   the instance's memory, in a fixed window: 600 a minute by default,
   `rateLimit: { requests, window }` (a window in milliseconds) to change
   it, `rateLimit: false` to turn it off; each number is a whole number
   above 0, checked at start.
2. The address is the client's as `proxies` reads it (D-116); an IPv6
   address counts by its /64, an IPv4-mapped one as IPv4. A local or
   private address is never counted, so a proxy that `proxies` does not
   name is not refused for all its clients.
3. Over the limit, the server answers 429 `TOO_MANY_ATTEMPTS` with
   `details: { retryAfter }` and `Retry-After`, the seconds until the
   window ends, before the gates, the caller and the routes, so a flood
   reads no session. Master's key passes over the limit; a wrong key does
   not. The first refusal of an address in a window logs a warning.
4. Each instance counts its own requests: behind a load balancer the limit
   is per instance. A shared store is decided when an application needs it.
5. A limit per person on a write is the model's `beforeCreate` hook: it
   counts the caller's rows since the window began and throws
   `TOO_MANY_ATTEMPTS`, which HTTP sends the same way. The hooks guide shows
   it. Sign-in and password reset keep the `password` plugin's limits, per
   account and address together (D-56, D-113).

Why: without a limit, one client, signed in or not, sends as many requests
as Node takes, and an application should not need a proxy to survive it.
Counting before the caller keeps a flood from costing a database read per
request; counting in memory costs no store and no dependency beyond
ipaddr.js. A hook counts operations, not requests, so REST, GraphQL aliases
(D-107 point 6) and server code share one count, where Parse's limit per
path is bypassed by a batch (CVE-2026-30972) and sees `/graphql` as one
path. Before, in Parse:

```ts
new ParseServer({
	rateLimit: { requestPath: '*', requestTimeWindow: 60_000, requestCount: 600 },
})
```

After:

```ts
httpPlugin() // 600 requests a minute per address
httpPlugin({ rateLimit: { requests: 100, window: 60_000 } })
httpPlugin({ rateLimit: false }) // a proxy limits in front
```

A limit per person:

```ts
export const Message = defineModel({ name: 'Message', fields }).with({
	hooks: {
		beforeCreate: async ({ caller }): Promise<void> => {
			if (caller.kind !== 'user') return
			const since = new Date(Date.now() - 60_000)
			const recent = await Message.count(
				{ where: { authorId: caller.user.id, createdAt: { gt: since } } },
				{ as: master },
			)
			if (recent >= 30) {
				throw new PublicError('TOO_MANY_ATTEMPTS', 'Wait a minute.', {
					details: { retryAfter: 60 },
				})
			}
		},
	},
})
```

Rejected: no limit, a proxy's job (most small deployments have none); a
separate `rateLimit()` plugin (the address and the upgrades are the HTTP
plugin's, and a safety net on by default should not need installing); a
Redis or database store (a dependency and a read per request, for a
deployment of several instances no application has yet); a sliding window
(more memory per address for a smoother edge a safety net does not need);
a `.with({ rateLimit })` key per operation (it saves the hook's ten lines);
limits per path, as Parse (a batch or a GraphQL document holds many
operations).

## D-219: A rule across a row's fields, and a check of your own

Choice: amends D-98; D-149 and D-215 are unchanged.

1. A rule that compares fields of one row is the model's `afterCreate` and
   `afterUpdate` hooks: they read `record`, the row as written, run for
   every caller and each row of a bulk write, and a throw undoes the write.
   The hooks guide shows it. The hook chooses the writes it checks, so a
   rule a `setNull` relation may empty later does not refuse that delete.
2. `postgres()` returns a `check` constraint's refusal (`23514`) as
   `VALIDATION_FAILED`, `Invalid data.`, with one issue: `path: []` and
   `The row breaks the check <name>.`, the constraint's name. UltimaBase
   writes no check on a model's table, so every such constraint is the
   application's own, added in its SQL migration (D-137); `migrate create`
   leaves it in place, as it drops only the constraints it knows.

Why: before, a hand-written check returned 500 `INTERNAL`, a crash for the
client where the row was only refused. The issue names the constraint and
no field: Postgres does not say which column broke it. A hook holds the
rule in TypeScript, for every caller, with a code of the application's own.
Before:

```ts
// migration: alter table "visit" add constraint "visit_ended"
//   check (("ended_at" is null) = ("end_reason" is null));
await Visit.create({ data: { endedAt: new Date() } }, { as: master })
// INTERNAL, 500
```

After, the same constraint:

```ts
await Visit.create({ data: { endedAt: new Date() } }, { as: master })
// VALIDATION_FAILED, issues: [{ path: [], message:
//   'The row breaks the check visit_ended.' }]
```

Or the rule as a hook:

```ts
export const Call = defineModel({ name: 'Call', fields }).with({
	hooks: {
		afterCreate: ({ record }) => checkEnding(record),
		afterUpdate: ({ record }) => checkEnding(record),
	},
})
```

Rejected: a model `checks` key that writes `check` constraints (a
constraint holds at every write, so a rule that a `setNull` relation may
empty would refuse the target's delete; comparing two fields is the field
references D-149 rejected; an OR of conditions goes beyond the filters
D-215 accepts); checking in `beforeUpdate` (its `data` holds only the
changed fields, so each rule merges them with `record` itself); a field in
the issue's `path` read from the constraint's SQL (a guess Postgres does
not make).

## D-220: A relation kept within the row's parent

Amended by D-235, D-236 and D-238.

Choice: amends D-37 and D-99; D-54 is unchanged.

1. A stored `one` relation takes `within`: its target shares a parent with
   the row. `within: 'project'` says the target's `project` is the row's
   `project`. `within: { campaign: 'id' }` says the target's `campaign` is the
   row itself, and `within: { stage: 'mainStage' }` says the target's `stage`
   is the row's `mainStage`. One pair: a target field, and `id` or a field of
   the row.
2. The relation is stored. The row's field is a stored `one`, optional or
   not, and the target's field a required stored `one` to the same model, or
   to the row's model when the row's side is `id`. The types check the row's
   field as a virtual's `needs` (D-180); the start checks both, the target's
   read from the target's model:
   `Task.milestone: within names project, a required one relation of
Milestone to Project.`, `Task.milestone: within names mainStage, a one
relation of Task.`
3. The rule holds when either side changes: a write that links the row to a
   target, through `connect`, `connectOrCreate` or the target's own side,
   changes the row's parent, or changes the target's parent while a row
   links it. A row whose relation or parent is `null` holds nothing. The
   target's field is required: the database's key compares only the row's
   side, and skips it when one of its values is `null`.
4. The kernel checks it among the write's checks (D-99), in the write's
   statement, with no extra query. A target that does not exist stays
   `NOT_FOUND`; one of another parent is `VALIDATION_FAILED`, one issue on the
   field the write gave, whichever side it wrote:
   `Task.milestone needs a Milestone of the same project.` A nested `create`
   of the target is checked on its data. A check reads the rows as they were
   before the write: a write that both moves a target and links it is
   checked against the target's former parent, and `postgres()` holds the
   rule at commit.
5. `postgres()` holds it too, against concurrent writes and SQL of the
   application's own: a unique key on the target's `(id, project_id)`, and a
   foreign key from the row's `(milestone_id, project_id)` to it, deferred as
   the others (D-98). The relation's own foreign key keeps `onDelete`, which
   the kernel applies (D-54): a `setNull` empties `milestone_id` only, so the
   composite key no longer compares. Its refusal, which a race alone
   reaches, is the issue on the row's relation. `migrate create` writes and
   drops both with `within`.
6. `memory()` needs nothing more: its writes run one at a time.
7. A `many` relation takes no `within`: its link table holds no parent.

Why: rows of a group point at rows of the same group, and nothing stopped a
task from linking another project's milestone. A hook checks it with a read
per write, misses the target's side unless a second hook watches it, and
lets two concurrent writes through, each reading the state before the
other; only the database's key holds against those. Before, two hooks:

```ts
const sameProject = async (record: TaskRow): Promise<void> => {
	if (record.milestone === null) return
	const found = await Milestone.count(
		{
			where: {
				id: record.milestone.id,
				project: { is: { id: record.project.id } },
			},
		},
		{ as: master },
	)
	if (found === 0) throw new PublicError('NOT_SAME_PROJECT', 'Wrong project.')
}

export const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		project: f.one(() => Project),
		milestone: f.one(() => Milestone, { optional: true }),
	}),
}).with({
	hooks: {
		afterCreate: ({ record }) => sameProject(record),
		afterUpdate: ({ record }) => sameProject(record),
	},
})
// ...and on Milestone, an afterUpdate refusing a project change while tasks
// link it.
```

After:

```ts
export const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		project: f.one(() => Project),
		milestone: f.one(() => Milestone, { optional: true, within: 'project' }),
	}),
})

export const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		milestones: f.many(() => Milestone),
		// One of the project's own milestones, and a task of that milestone.
		featured: f.one(() => Milestone, {
			optional: true,
			within: { project: 'id' },
		}),
		featuredTask: f.one(() => Task, {
			optional: true,
			within: { milestone: 'featured' },
		}),
	}),
})
```

Rejected: a hook per relation (the reasons above); several pairs per
relation (no case needs them yet); `sameAs` (it does not read for
`{ project: 'id' }`); the composite key alone, with `on delete set null
(milestone_id)` (the kernel applies `onDelete`, and the relation's own key
keeps telling a missing target from another parent's); clearing the
relation when a parent changes (a silent loss, where refusing names it);
the target's field checked by the types (its model's type, read inside a
cycle of models such as `Task` and `Milestone`, makes the types circular).

## D-221: Jobs: an outbox and scheduled jobs, a plugin

Choice: the plugin `@ultimabase/jobs` runs work after a write commits, later,
or on a schedule, with no kernel change (D-25):

1. A job is declared with `defineJob({ name, run })` (D-13) and registered
   with `jobsPlugin({ jobs: [...] })`. Its `run` receives `{ input, id }` and
   runs as Master (D-19).
2. Each pending run is a row of the plugin's model `JobsRun`: the job's
   name, its input, when it is due, its attempts, its last error, its lease
   and its state (`pending` or `failed`). A run that succeeds deletes its row.
3. The call starts from the definition, as `Model.create` (D-18) and
   `fn.run` (D-75): `job.enqueue(input, { after })`, or
   `job.enqueue({ after })` when it has no input. It validates the input
   (a Standard Schema, as a function's, D-27) and writes the row in the
   current transaction, or alone outside one (D-36). Written from an
   `after*` hook, the row exists if and only if the write committed. It
   takes no `as`: enqueuing is server code.
4. No `job.run`: it would skip the queue and the retries. Tests run the due
   jobs with `runJobs()` from `@ultimabase/testing`.
5. `after` delays a run, in milliseconds (a number, as `sessions.lifetime`
   in D-165 and `limit.window` in D-218). No cancellation: a run checks the
   state it acts on when it runs.
6. A job has one form, which the types enforce: an `input`, or `every`
   (milliseconds), or `cron` (a pattern of five fields: a standard, not a
   keyword of ours, D-14). `timeZone` exists only
   with `cron` and is UTC by default. A recurring job takes no input and is
   never enqueued. `defineJob` refuses at import an `every` that is not a
   positive number and a `cron` croner refuses; `enqueue` refuses an `after`
   that is not a positive number.
7. One instance runs a row at a time, through a lease: an `updateMany` of
   the row where its lease has expired sets it five minutes ahead, and only
   the instance whose update counts one row runs it. It works on memory and
   postgres alike, and a lease held by an instance that died expires.
8. A run happens at least once: a run longer than its lease, or an instance
   dying after the job's effect and before the row's delete, runs it again.
   `id`, the row's id, is the key a job makes its effect idempotent with.
9. A failed run is retried after 10 s, 20 s, 40 s and so on, doubling, up
   to ten attempts (about 2 h 50 min in all); then its row turns `failed`,
   is kept, and is logged with the job's name and the error. A recurring
   job's failure is logged and its next occurrence runs as usual.
10. The instance that enqueued a run starts it right after the commit when
    it is due; every instance looks for due rows every five seconds, a
    fixed value and not an option.
11. A recurring job has one row, which holds its next due time and its
    pattern; a run sets the next one. At startup the plugin creates the
    rows of new recurring jobs, sets again the due time of one whose
    `every` or `cron` changed, and deletes those of jobs no longer
    declared. A row whose job is no longer declared turns `failed` when it
    is due.
12. An occurrence missed while no instance ran runs once at startup, never
    once per missed occurrence.
13. Cron patterns go through `croner` (D-92), only for
    `new Cron(pattern, { timezone, mode: '5-part' }).nextRun(from)`, never as a
    timer. It removes the parsing of a format and the time-zone and daylight
    saving rules, a subject of its own. Version 11, whose daylight saving
    handling 10 lacked: a fixed time skipped by spring forward runs at the
    first valid time after the gap, and once when fall back repeats it. A
    test fixes both. Days of the month and of the week combine with OR, as
    in cron.
14. The memory adapter takes the same path; `runJobs()` runs the due rows
    of a test application, against a clock the test advances.

Out of scope: the files sweep (D-152), which keeps its own timer, since
plugins are independent of each other (D-21).

Why: a commit hook (D-15) runs once, in memory: a crash or a failure after
the commit loses its work, and Parse had nothing better. A row written in the
write's transaction keeps it, and a process that dies leaves it for another.
A `setTimeout` lives in one process and is lost at restart.

Before: a commit hook, lost on a crash or a failed call, and a timer kept in
one process:

```ts
export const CampaignSession = defineModel({
	name: 'CampaignSession',
	fields: (f) => ({ closedAt: f.dateTime({ optional: true }) }),
}).with({
	hooks: {
		afterUpdateCommit: async ({ record }) => {
			if (record.closedAt !== null) await voice.closeRoom(record.id)
		},
	},
})

// Ends a user's sessions ten minutes after they go offline.
const timers = new Map<string, NodeJS.Timeout>()
function offline(user: string) {
	timers.set(
		user,
		setTimeout(() => void endSessions(user), 10 * 60 * 1000),
	)
}
```

After:

```ts
export const closeRoom = defineJob({
	name: 'closeRoom',
	input: z.object({ session: z.string() }),
	run: ({ input, id }) => voice.closeRoom(input.session, { key: id }),
})

export const CampaignSession = defineModel({
	name: 'CampaignSession',
	fields: (f) => ({ closedAt: f.dateTime({ optional: true }) }),
}).with({
	hooks: {
		// In the write's transaction: the run exists if the update committed.
		afterUpdate: async ({ record }) => {
			if (record.closedAt !== null) {
				await closeRoom.enqueue({ session: record.id })
			}
		},
	},
})

export const endSessions = defineJob({
	name: 'endSessions',
	input: z.object({ user: z.string() }),
	// Checks the user is still offline: a run is never cancelled.
	run: ({ input }) => endIfOffline(input.user),
})
await endSessions.enqueue({ user }, { after: 10 * 60 * 1000 })

export const dailyDigest = defineJob({
	name: 'dailyDigest',
	cron: '0 3 * * *',
	timeZone: 'Europe/Paris',
	run: () => sendDigests(),
})

export const app = defineApp({
	database,
	models,
	plugins: [jobsPlugin({ jobs: [closeRoom, endSessions, dailyDigest] })],
})
```

In a test:

```ts
const running = testApplication(app)

it('closes the room once the session closes', async () => {
	await CampaignSession.update(
		{ where: { id }, data: { closedAt: new Date() } },
		{ as: master },
	)
	await runJobs()
	expect(voice.closed).toStrictEqual([id])
})
```

Rejected:

- `app.enqueue('closeRoom', input)`, which names the job by a string and
  imports the application (D-18, D-75).
- `job.run`, which skips the queue and the retries.
- `as` on `enqueue`: a run acts on the server's behalf, after the caller's
  request.
- A PostgreSQL advisory lock, which memory does not have and which a
  connection pool makes hard to hold.
- Exactly once: no queue that calls another service can promise it; the
  key moves it to the service.
- Cancelling a run: the job checks its state instead, which also covers the
  state changing after the run was enqueued.
- Durations as strings (`'10 minutes'`), through the `ms` package: the
  repository's durations are numbers of milliseconds, and `ms('10 minutes')`
  gives one for whoever wants to write them so.
- Croner as the scheduler: its timers run in every instance, where the
  lease runs each occurrence once.
- Six- and seven-field patterns (seconds, years): no case needs them, and a
  five-second poll could not keep a second's precision.
- A missed occurrence run once per occurrence, which floods a restart.
- The files sweep moved onto jobs, which would make files require jobs.

## D-222: The maintenance's `retryAfter` is a positive number

Choice: amends D-205 point 2.

1. `maintenancePlugin({ retryAfter })` takes a finite number of
   milliseconds above 0. Another value, as `NaN`, `0`, a negative number or
   `Infinity`, refuses the start:
   `The maintenance's retryAfter is a positive number of milliseconds.`

Why:

- The header carried the value as written: `Retry-After: NaN` and
  `Retry-After: -5`, which a client reads as nothing or as at once, and
  `details.retryAfter` was `null` for `NaN`. The start refuses an `initial`
  it does not know already (D-207 point 4).
- `0` tells every client to try again at once, which loads the servers
  during the maintenance.

Rejected:

- Accepting `0`, for the reason above.
- Clamping a wrong value to the default: a typo would pass unseen.

Example, before: a value read from the environment, unset, starts the
application and sends `Retry-After: NaN`.

```ts
maintenancePlugin({ retryAfter: Number(process.env.RETRY_AFTER) })
// 503, retry-after: NaN, { "details": { "retryAfter": null } }
```

After: the start says why.

```ts
maintenancePlugin({ retryAfter: Number(process.env.RETRY_AFTER) })
// Refused: The maintenance's retryAfter is a positive number of milliseconds.
```

## D-223: The server's own origin over HTTPS, and the body limit and drain checked

Choice: amends D-106 points 5 and 6, D-154 (the upgrade's origin) and D-204
point 6.

1. An `Origin` is the server's own when its host, with its port, is the one
   the request was sent to, whatever its scheme. The form check (D-106
   point 6) and the upgrade check (D-154) both read it so:
   `https://api.example.com` is the own origin of a request to
   `http://api.example.com`, as a proxy serving HTTPS forwards it.
2. `bodyLimit` is a whole number of bytes above 0. Another value, as `NaN`,
   `Infinity`, `0`, `-1` or `1.5`, refuses the start:
   `bodyLimit is NaN, not a whole number of bytes above 0.`
3. `drain` is a whole number of milliseconds, 0 included. Another value
   refuses the start: `drain is -1, not a whole number of milliseconds.`

Why:

- The server serves HTTP only, and HTTPS comes from a proxy (D-106). It saw
  `http://api.example.com`, and a page of the API's own origin sent
  `Origin: https://api.example.com`: its WebSockets were refused with a 403,
  and its forms too in a browser that sends no `Sec-Fetch-Site`, unless
  `cors` listed the API itself.
- Comparing the hosts lets no other site in: a browser names the page's
  origin, which a script cannot change. The scheme added nothing:
  `http://api.example.com` passed already.
- `bodyLimit: NaN` and `Infinity` lifted the limit: a body of 5 MB passed. A
  negative limit refused every body. `drain: NaN`, `-1` and `Infinity`
  skipped the drain, and `Infinity` printed Node's `TimeoutOverflowWarning`.
  The start refuses a wrong `proxies`, `port` and `rateLimit` already.
- `0` as a body limit refuses every body; a mount that reads its own body
  lifts the limit with `bodyLimit: false` (D-153).

Rejected:

- Reading `X-Forwarded-Proto` for the scheme: it is trusted only behind
  `proxies`, and the host alone decides the same thing.
- Clamping a wrong value to the default: a typo would pass unseen.

Example, before: behind a proxy serving HTTPS, a dashboard served by the
API itself opens a subscription.

```ts
httpPlugin({ cors: ['https://app.example.com'] })
// From a page of https://api.example.com:
new WebSocket('wss://api.example.com/graphql')
// 403 "A WebSocket from another origin is refused."
```

After: it opens, with no `cors` entry for the API itself.

```ts
httpPlugin({ cors: ['https://app.example.com'] })
new WebSocket('wss://api.example.com/graphql') // 101
```

Before: a limit read from the environment, unset, lifts the limit.

```ts
httpPlugin({ bodyLimit: Number(process.env.BODY_LIMIT) })
// a body of 5 MB passes
```

After: the start says why.

```ts
httpPlugin({ bodyLimit: Number(process.env.BODY_LIMIT) })
// Refused: bodyLimit is NaN, not a whole number of bytes above 0.
```

## D-224: An issue's code, from a schema and from the password's refusals

Amended by D-231.

Choice: amends D-88 and D-209.

1. The kernel keeps an issue's `code` from any Standard Schema, a
   function's input or a field's schema, when it is a string of capitals,
   digits and underscores starting with a capital: `PASSWORD_LENGTH`. Any
   other `code`, as Zod's `too_small`, is dropped, as before: an issue's
   code is the application's stable contract, not a library's.
2. The password's three refusals of a new password carry a code:
   `PASSWORD_LENGTH` (8 to 256 characters), `PASSWORD_IS_EMAIL` and
   `PASSWORD_BREACHED`, on sign-up, `changePassword`, a reset and
   `User.setPassword`. One code for the length: the bounds are fixed.
3. In a function, the three refusals share the path the input's other
   issues have, `['input', 'newPassword']`; a command's stay on the
   argument, `['password']`. The messages do not change.
4. An issue's code is not an error's: the error stays `VALIDATION_FAILED`,
   so a plugin does not declare its issue codes in its `PluginTypes`
   `errors` (D-206), which types `error.code`.

Before, a client told a breached password from a short one by its English
message, and `changePassword`'s two refusals of the same field had two
paths:

```ts
// changePassword({ input: { currentPassword, newPassword: 'short' } })
issues: [
	{
		path: ['input', 'newPassword'],
		message: 'A password has 8 to 256 characters.',
	},
]
// changePassword({ input: { currentPassword, newPassword: 'ada.lovelace' } })
issues: [{ path: ['newPassword'], message: 'A password cannot be the email.' }]
```

After:

```ts
issues: [
	{
		path: ['input', 'newPassword'],
		message: 'A password has 8 to 256 characters.',
		code: 'PASSWORD_LENGTH',
	},
]
issues: [
	{
		path: ['input', 'newPassword'],
		message: 'A password cannot be the email.',
		code: 'PASSWORD_IS_EMAIL',
	},
]

const [issue] = error.details.issues
const text = {
	PASSWORD_LENGTH: t('length'),
	PASSWORD_IS_EMAIL: t('email'),
	PASSWORD_BREACHED: t('breached'),
}
```

Rejected:

- Checking the length in the function's run, after its input: a sign-up
  would no longer list every issue of its input at once.
- Keeping any string `code`: Zod's and ArkType's issue codes would reach the
  client, and change with the library.
- `PASSWORD_TOO_SHORT` and `PASSWORD_TOO_LONG`: a client knows the bounds,
  and the length of what it sent.

## D-225: `.commands` before `.with`, and a builder's return type across models

Choice: amends D-217.

1. `.commands` comes before `.with`. TypeScript checks a generic call in
   full, its receiver included, so a `.with` before `.commands<T>` is
   checked again; in a cycle of relations, rules that read a model of the
   cycle, as the signed-in user's through `Register.user`, make the model
   read itself in its own type (TS7022). Outside such a cycle either order
   still compiles; the guide's examples call `.commands` first.
2. When two models' commands call each other, the builder of the one whose
   interface names the other, `leave(games: WhereOf<typeof Game>)`, writes
   its return type: `({ queries }): SeatCommands => ({ … })`. Without it,
   TypeScript infers the builder's return from its body, which reads
   `Game`, whose builder calls `Seat` (TS7024, TS7022).

Why: neither comes from the kernel's types. TypeScript resolves a generic
call fully and infers an unannotated arrow's return from its body; the
guide said `.commands` came "before or after `.with`", and named no
annotation.

Rejected:

- Types that refuse a `.with` before `.commands`: every model's type would
  carry its calls' order, for a cycle few models have, and the second case
  would remain.
- A curried `.commands<T>()(build)`: it fixes the second case only, and
  changes every command's definition for it.

Example:

```ts
// Before: Membership types as `any` (TS7022), as Register.user is Account.
export const Membership = defineModel({ name: 'Membership', fields })
	.with({
		access: {
			read: signedIn(({ user, where }) =>
				where({ user: { is: { id: user.id } } }),
			),
		},
	})
	.commands<MembershipCommands>(() => ({ join: async () => {} }))

// After
export const Membership = defineModel({ name: 'Membership', fields })
	.commands<MembershipCommands>(() => ({ join: async () => {} }))
	.with({
		access: {
			read: signedIn(({ user, where }) =>
				where({ user: { is: { id: user.id } } }),
			),
		},
	})

// Before: Game and Seat type as `any` (TS7024, TS7022).
export const Seat = defineModel({
	name: 'Seat',
	fields,
}).commands<SeatCommands>(({ queries }) => ({
	leave: async (games) => {
		/* … */
	},
}))

// After
export const Seat = defineModel({
	name: 'Seat',
	fields,
}).commands<SeatCommands>(({ queries }): SeatCommands => ({
	leave: async (games) => {
		/* … */
	},
}))
```

## D-226: A count alone reads no row

Choice: completes D-134 point 5 and 6; amends D-154 point 3.

1. A connection that asks for its `totalCount` and no row reads no row:
   the count is its only read, at the root, in a relation and in a
   function's page (D-182), over HTTP and live.
2. GraphQL reads it from the selection: a connection whose selection has
   neither `edges` nor `pageInfo` asks for no row, whatever its `first`.
   `first: 0` or `last: 0`, with no cursor, asks for none either, so its
   `pageInfo` comes from the count.
3. REST has no selection of a connection's fields, so it asks with
   `first: 0` (or `last: 0`), no cursor, and `totalCount: true`, at the
   root, in an `include` and in a function's page. GraphQL takes the same
   arguments with the same meaning (D-129).
4. Without a row, `hasNextPage` (forward) or `hasPreviousPage` (backward)
   is `totalCount > 0`, the cursors `null` and `edges` empty: what a read
   of one row more said. With a cursor, `first: 0` still reads that one
   row: the count holds the whole `where`, not what follows the cursor.
5. A live list takes `first: 0` (D-154 point 3 said a positive integer),
   and GraphQL follows a live connection that selects neither `edges` nor
   `pageInfo` with a window of none. The window still reads the sort keys
   of the row past it and of one more, to tell whether rows follow and to
   place a change, never a node. `fetchMore` grows it by 1 row at least.
6. The row budget is unchanged: a `totalCount` counts as `take` rows at
   least (D-134 point 7), since the count reads what it counts.

Why:

- A list that shows "12 comments" under each post read a full page of
  comments per post, 101 rows by default, to drop them all.
- A live counter, the members online in a room, needed a window of rows
  it never showed, which also counted against `maxLive`.

Rejected:

- A REST grammar to leave `edges` out (`include={"posts":{"edges":false}}`):
  a second way to say what `first: 0` says, and GraphQL has no such
  argument.
- Deriving `hasNextPage` from the count after a cursor, which would need a
  second count of the rows after it.
- A live window of no row at all, which would need the realtime window to
  place changes without the row past it: a rewrite for two keys read.

Example:

```graphql
# Before: 101 comments read per post, then dropped. After: one count each
posts(first: 20) {
	edges {
		node {
			title
			comments {
				totalCount
			}
		}
	}
}

# Before: refused, "first must be a positive integer.". After: a live count
subscription {
	members(where: { online: true }) {
		totalCount
	}
}
```

```
# Before: one comment read per post. After: none
GET /api/posts?first=20&include={"comments":{"first":0,"totalCount":true}}

# Before: refused. After: a live count, as server-sent events
GET /api/members?first=0&totalCount=true&where={"online":true}
Accept: text/event-stream
```

## D-227: No empty GraphQL input, and an invalid schema refuses the start

Choice: amends D-107 point 8, D-128, D-138 and D-142.

1. GraphQL has no input object without a field, so none is generated, nor
   the argument or mutation that would take it:
   - a nested relation input leaves out `create`, `connectOrCreate` and
     `update` when its target has no field to write but the relation back:
     it keeps `connect`, and `disconnect`, `delete` and `set` where they
     apply;
   - a model with no field to write is created with `createPing { id }`,
     without `data`, and has no `updatePing` and no `upsertPing`.
2. The plugin validates the served schema, `extend` applied, before the
   start: an invalid one refuses it with GraphQL's messages, as
   `graphqlPlugin: the schema is invalid. Input Object type Empty must define
one or more fields.`
3. Requests run on `graphql-http`'s core handler rather than its fetch
   adapter: an error it throws reaches the HTTP plugin, which logs it with a
   `correlationId` and answers `INTERNAL` (D-106).

Why:

- A model whose only fields are relations, as a book that is only its shelf,
  generated `BookCreateWithoutShelfInput {}`. The schema was invalid: every
  request, `{ __typename }` included, got an empty 500.
- The fetch adapter caught the error and printed it with `console.error`, so
  the application's logger showed only `POST /graphql 500`.
- Such a target is still created on its own side, and a row without data is
  still created; only the forms GraphQL cannot write go.
- REST is unchanged: its body is JSON, where `{}` is a value.
  `PATCH /api/pings/:id` with `{}` still answers 200.

Rejected:

- A placeholder field, as `_: Boolean`, in each empty input: it appears in
  every client's types and means nothing.
- Validating on the first request: the start is where a schema error is
  seen and fixed.

Example, before: a book is only its shelf.

```ts
const Book = defineModel({
	name: 'Book',
	use: [graphql()],
	fields: (f) => ({ shelf: f.one(() => Shelf) }),
})
```

```graphql
{
	__typename
}
# 500, empty body, on every request
```

After: the schema is served, and a shelf's books are connected.

```graphql
mutation {
	createBook(data: { shelf: { connect: { id: "…" } } }) {
		id
	}
}
mutation {
	updateShelf(where: { id: "…" }, data: { books: { connect: [{ id: "…" }] } }) {
		id
	}
}
```

Before: an `extend` that breaks the schema starts, then fails every
request.

```ts
graphqlPlugin({ extend: () => brokenSchema })
// starts; every request: 500, empty body
```

After: the start says why.

```ts
graphqlPlugin({ extend: () => brokenSchema })
// Refused: graphqlPlugin: the schema is invalid. Input Object type Empty
// must define one or more fields.
```

## D-228: A filter nests at most 32 levels

Choice: amends D-20, D-55 and D-149.

1. A `where` nests at most 32 levels. The filter is level 1; each item of
   `AND`, `OR` and `NOT`, and each relation filter (`is`, `isNot`, `some`,
   `every`, `none`, `viewer`), is one level deeper. The kernel refuses the
   33rd level as it reaches it, without reading further, as
   `INVALID_QUERY`, which a transport answers `BAD_USER_INPUT`, a `400`:
   `where.NOT.….NOT: the filter is nested more than 32 levels deep.`
2. A `having` nests at most 32 levels too, its `AND`, `OR` and `NOT` counted
   the same way.
3. The limit holds for every caller, Master and server code included, a
   read or write rule's filter and a `beforeFind`'s too: it is not D-55's
   budget against clients but the stack's own limit.
4. REST and GraphQL read a filter's dates and json values through the same
   levels; past the 32nd they leave the rest as it is, for the kernel to
   refuse. `maxFilterDepth` is exported from `ultimabase/internal` for them.
5. GraphQL's variables are coerced by graphql-js, recursively, before the
   plugin sees them: variables nested deeper than the stack answer
   `BAD_USER_INPUT`, `The variables are nested too deep.`, instead of
   `INTERNAL`.

Why:

- Filters were read recursively at every step, the kernel's, REST's and
  graphql-js's: a filter 5,000 levels deep ran out of stack, which answered
  `500 INTERNAL` and logged an error, for one request a client can send
  again and again.
- 32 levels is far more than a hand-written or generated filter needs, and
  far less than the stack holds, with room for a filter combined with rules.
- One limit, in the kernel, answers the same in REST, GraphQL and functions
  (D-129); a transport only stops reading where the kernel refuses.

Rejected:

- Exempting Master and server code, as D-55 does: past the stack they fail
  anyway, with a `RangeError`.
- Bounding the depth of GraphQL's variables as JSON: the bound would be
  arbitrary, and would refuse a json field's value nested deep.
- Reading filters without recursion: every walker, graphql-js's included,
  would change, for filters no one writes.

Example, before:

```ts
let where: PostWhere = { title: 'a' }
for (let level = 1; level < 5000; level += 1) where = { NOT: where }
await Post.findMany({ where })
// RangeError: Maximum call stack size exceeded
```

```http
PUT /api/posts
{ "where": { "NOT": { "NOT": … 5,000 levels … } }, "create": {}, "update": {} }
500 { "code": "INTERNAL", "message": "Internal error." }
```

After:

```ts
await Post.findMany({ where })
// InvalidQuery: where.NOT.….NOT: the filter is nested more than 32 levels deep.
```

```http
GET /api/posts?where={"NOT":{"NOT": … 33 levels … }}
400 { "code": "BAD_USER_INPUT", "message": "where.NOT.….NOT: the filter is nested more than 32 levels deep.", "details": { "path": "where.NOT.….NOT" } }
```

```graphql
query ($where: PostWhereInput) {
	posts(where: $where) {
		totalCount
	}
}
# $where 33 levels deep: BAD_USER_INPUT, where.NOT.0.….NOT.0: the filter is
# nested more than 32 levels deep.
# $where 20,000 levels deep: BAD_USER_INPUT, The variables are nested too deep.
```

## D-229: A live function's rows count in `maxRows` over a WebSocket

Choice: amends D-154 point 12; D-107's row budget is unchanged.

1. A live function's subscription over a WebSocket is counted by the row
   budget as the same query over HTTP: a document that may return more than
   `maxRows` rows is refused with `BAD_USER_INPUT` before `run` runs, and
   Master's is not counted (D-107).
2. The budget counts the document once, when it is subscribed, not at each
   wake: a wake runs the same document.
3. A model's live list and live row stay out of `maxRows`: `maxLive`,
   `maxTake` in page mode and `maxConnectionRows` bound them (D-154), and
   the rows of the relations they select count in `maxLive` instead. REST's
   live lists check their depth only.

Why: `{ ranked(above: 0) { id } }` over HTTP was refused past `maxRows`, but
`subscription { ranked(above: 0) { id } }` ran in full, then again at each
write, so a client with a socket skipped the budget. A live list's rows are
already bounded, by limits sized for a list that is kept; counting them
again in `maxRows` would refuse the large live lists D-154 serves.

Example, before: `maxRows: 5`, and a function's list counts `take`, 100.

```graphql
query {
	ranked(above: 0) {
		id
	}
}
# The document asks for more than 5 rows. Ask for fewer with first or last.
subscription {
	ranked(above: 0) {
		id
	}
}
# runs, and runs again at each write
```

After: both are refused with the same error; Master's are both served.

Rejected: counting at each wake (the document does not change between
wakes); counting a model's live list in `maxRows` (its own limits bound it,
and REST does not count it).

## D-230: Each operation over a WebSocket counts as a request

Choice: amends D-218 point 1 and D-154 point 5.

1. Each `subscribe` message on a GraphQL socket counts as one request of
   the address the upgrade came from, in the same window as its HTTP
   requests. Pings, `connection_init` and `complete` are not counted.
2. Over the limit, that operation fails with `TOO_MANY_ATTEMPTS`,
   `Too many requests: try again later.`, and `details: { retryAfter }`,
   the seconds until the window ends, as the 429's body. The socket stays
   open: the next operation after the window runs.
3. An operation is counted once the connection's caller is read and before
   its document is parsed, so a flood costs neither a parse nor a session
   read. Master's key on the upgrade request passes, as over HTTP; a
   connection whose caller is Master through `connection_init` only is
   counted.
4. `httpPlugin`'s `Upgrade` gains `limit()`: it counts one more request of
   the upgrade's address and returns the seconds to wait when it is over
   the limit, `undefined` within it. A plugin that serves several
   operations on one socket calls it for each.

Why: the limit counted the upgrade only, so one socket carried as many
queries and mutations as the client sent, past any limit. Closing the socket would end the client's live
subscriptions for one operation too many, so only that operation is
refused, as an HTTP request is.

Example, before: `rateLimit: { requests: 3, window: 60_000 }`.

```ts
await fetch(url, init) // 200
await fetch(url, init) // 200
await fetch(url, init) // 429
const client = createClient({ url: ws })
await first(client, '{ ping }') // "pong", and every one after
```

After: the upgrade and two operations, then:

```ts
await first(client, '{ ping }')
// errors: [{ message: 'Too many requests: try again later.',
//   extensions: { code: 'TOO_MANY_ATTEMPTS', details: { retryAfter: 60 } } }]
```

A plugin with its own socket protocol:

```ts
plugins.http.upgrade('/feed', (upgrade) => {
	onMessage(upgrade, async (message) => {
		const retryAfter = await upgrade.limit()
		if (retryAfter !== undefined) return refuse(message, retryAfter)
		return serve(message)
	})
})
```

Rejected: closing the socket over the limit (it ends the client's live
reads for one operation); a separate count per socket (a client opens
another socket); counting each message, pings included (a quiet
connection would use the address's budget).

## D-231: Each plugin declares its issue codes, and `IssueCodeOf<typeof app>`

Choice: amends D-206 and D-224.

1. A plugin's types take `issues`, the union of the codes its
   `VALIDATION_FAILED` issues carry, in capitals:
   `readonly issues: 'PASSWORD_LENGTH' | 'PASSWORD_IS_EMAIL' | 'PASSWORD_BREACHED'`.
   `errors` keeps typing `error.code` only (D-224).
2. `ultimabase` exports the type `IssueCodeOf<A>`: for `typeof app`, the
   `issues` of each plugin `app` lists, `never` with none. The kernel gives
   no issue a code of its own. An application's own issue codes, from a
   schema or a `PublicError`, are not in it; a client adds them, as with
   `ErrorCodeOf` (D-206).
3. The password plugin declares its three codes (D-224).
4. One type-only key of a plugin's value and of the application carries
   both unions, `{ errors, issues }`: one more union is no new key and no
   new type parameter. `ultimabase` exports its type, `Codes`, which a
   declaration emitted for an exported `app` names.
5. `scripts/codes.test.ts` reads `issues` as it reads `errors`: a code a
   package sends is declared in one of them, and each one declared is
   sent. The password's codes leave its list of literals that are no code.

Why:

- A client translates each issue code, as it translates each error code. A
  list it writes by hand misses a code a plugin adds, and shows the generic
  text instead: typed against the application, the missing code fails its
  typing.
- The codes are the plugin's, beside its `errors` (D-206): no global
  declaration.
- The script held the password's codes in a hand-kept list of exceptions;
  declared, they are checked as every other code is.

Rejected:

- The issue codes in `errors`: `ErrorCodeOf` would list codes no error
  carries (D-224).
- A runtime list of the codes, which D-206 rejected: a client imports no
  server value. A client that tests a code at runtime keeps its list,
  checked against the type.
- A second type-only key and a fourth type parameter for the issues.

Example, before: the client lists the password's codes by hand, and a code
the plugin adds compiles and shows the generic text.

```ts
const passwordIssueCodes = [
	'PASSWORD_LENGTH',
	'PASSWORD_IS_EMAIL',
	'PASSWORD_BREACHED',
] as const
const messages: Record<(typeof passwordIssueCodes)[number], string> = {
	PASSWORD_LENGTH: '8 to 256 characters',
	PASSWORD_IS_EMAIL: 'Not your email',
	PASSWORD_BREACHED: 'Found in a data breach',
}
```

After: the application's type lists them, and a missing one fails typing.

```ts
import type { IssueCodeOf } from 'ultimabase'
import type { app } from './app.ts'

const messages = {
	PASSWORD_LENGTH: '8 to 256 characters',
	PASSWORD_IS_EMAIL: 'Not your email',
	PASSWORD_BREACHED: 'Found in a data breach',
} satisfies Record<IssueCodeOf<typeof app>, string>

// In a plugin's types:
interface Password extends PluginTypes {
	readonly name: 'password'
	readonly issues: 'PASSWORD_LENGTH' | 'PASSWORD_IS_EMAIL' | 'PASSWORD_BREACHED'
}
```

## D-232: A rename hint lists every added column alike, never one twice

Choice: amends D-105.

1. A removed column whose type only one added column has keeps its hint, as
   before: `migrate create` writes the SQL that renames it, and the `sync`
   refusal names the field to give `dbName`.
2. A removed column that several added columns may be lists them all, in
   the models' order, for the developer to choose; the refusal says
   `give one of Account.emailMessages, Account.emailInvites dbName: 'mail_on_message'`.
3. An added column that is the only one alike for two removals or more
   gives no hint: naming it on each would propose it twice.
4. Removed tables follow the same rules, compared by their columns' names,
   types and nullability, as before.
5. The file's hint says what to replace: the drop, and the line adding the
   column the developer keeps, which would fail once the rename made it.
   With one candidate:

   ```sql
   -- a rename? replace this drop and the line adding Account.emailMessages with: alter table … rename column …;
   ```

   With several, one commented line each, as in the example below.

6. `Statement.rename` is `{ dbName, to: { name, sql }[] }`: the adapter
   gives each candidate, and the kernel writes them.

Why:

- Each removal took the first added column of its type: settings renamed
  together in one change all got a hint into the same column, and following
  the hints put every value in it.
- A hint that looks right and is wrong is worse than none. Only the
  developer knows which column a removed one became.

Rejected:

- Picking the closest name: a guess presented as an answer.
- `migrate create --rename Account.mailOnMessage=emailMessages`, or a
  question per removal: a new API of the command, while editing the
  written SQL already says the rename. It can come later, on a need.

Example, before:

```ts
// Account's mailOnMessage, mailOnInvite and pushOnMessage become
// emailMessages, emailInvites and pushMessages, all booleans.
```

```sql
-- removing "Account.mailOnMessage" deletes data.
-- a rename? write: alter table "account" rename column "mail_on_message" to "email_messages";
alter table "account" drop column "mail_on_message";

-- removing "Account.mailOnInvite" deletes data.
-- a rename? write: alter table "account" rename column "mail_on_invite" to "email_messages";
alter table "account" drop column "mail_on_invite";
```

After:

```sql
-- removing "Account.mailOnMessage" deletes data.
-- a rename? replace this drop and the line adding the one you keep with one of:
--   alter table "account" rename column "mail_on_message" to "email_messages";
--   alter table "account" rename column "mail_on_message" to "email_invites";
--   alter table "account" rename column "mail_on_message" to "push_messages";
alter table "account" drop column "mail_on_message";
```

## D-234: A relation has no index of its own when a key or an index starts with it

Choice: amends D-98.

1. A stored `one` relation that is not unique gets its index,
   `<table>_<column>_idx`, unless a unique key or an index of its model
   starts with its column: PostgreSQL reads a B-tree by its first column,
   so that one serves the relation's reads and its foreign key's checks.
2. A key or an index counts unique or not, case-insensitive or not, but
   not partial (D-215), which holds only the rows it keeps, and not a
   `contains` one (D-141), a trigram index of a string.
3. An index of the model on the relation alone is now that index. Before,
   the start refused it: `the index on Membership.team and the index on
Membership(team) are both stored as "membership_team_id_idx"`.
4. A database built before keeps the extra index until the next sync or
   migration drops it. Dropping an index loses no data, so a sync applies
   it without `--force`.

Why: the extra index costs a write on each insert and update, and its
storage, for reads the other index already serves; schema linters report
it as redundant.

Rejected: dropping it for any index that holds the column, not first: a
B-tree read by a later column scans the whole index.

Example, before:

```ts
const Membership = defineModel({
	name: 'Membership',
	fields: (f) => ({ team: f.one(() => Team), person: f.one(() => Person) }),
	indexes: [{ fields: ['team', 'person'], unique: true }],
})
```

```sql
alter table "membership" add constraint "membership_team_id_person_id_key" unique ("team_id", "person_id");
create index "membership_team_id_idx" on "membership" ("team_id");
create index "membership_person_id_idx" on "membership" ("person_id");
```

After:

```sql
alter table "membership" add constraint "membership_team_id_person_id_key" unique ("team_id", "person_id");
create index "membership_person_id_idx" on "membership" ("person_id");
```

## D-235: A relation kept within an unset parent holds no target

Choice: amends D-220.

1. A row whose parent is `null` links no target through a relation kept
   within it: a target always has a parent of its own, so none shares an
   unset one. With `featuredTask` kept `within: { milestone: 'featured' }`,
   a project with no `featured` milestone has no `featuredTask`. A relation
   whose own value is `null` still holds nothing, as before.
2. The kernel refuses, among the write's checks (D-99), with D-220's issue:
   a write that links a target to a row whose parent is unset, through the
   row or the target's side, on the relation's field; a write that empties
   the parent of a row that keeps its target, from either side, on the
   parent's field. The same write emptying both is accepted.
3. A delete that empties the parent empties the target first. A target's
   field to the parent is required (D-220), so a parent deleted has its
   targets deleted by their `onDelete: 'cascade'`, or is refused by their
   `restrict`, and the row's relation is emptied with them, before the
   parent's.
4. `postgres()` holds it too, when the parent is an optional field: a check
   `CHECK (featured_id IS NOT NULL OR featured_task_id IS NULL)`, named
   `project_featured_task_id_within_check`, beside D-220's foreign key, which
   skips a row once one of its columns is `NULL`. A check is not deferred:
   the cascade empties the relation before the field it rests on. Its
   refusal, which a race alone reaches, is the issue on the row's relation.
   `migrate create` writes and drops it with `within`: `Project: made
featuredTask need featured`.

Why: a row with no parent took any target, the kernel's checks skipped it
and the database's key compared nothing, so an application wrote the
missing half in a hook, which concurrent writes passed. Before:

```ts
export const Project = defineModel({
	name: 'Project',
	fields: (f) => ({
		featured: f.one(() => Milestone, {
			optional: true,
			within: { project: 'id' },
		}),
		featuredTask: f.one(() => Task, {
			optional: true,
			within: { milestone: 'featured' },
		}),
	}),
}).with({
	hooks: {
		afterUpdate: ({ record }) => {
			if (record.featured === null && record.featuredTask !== null) {
				throw new PublicError('NO_MILESTONE', 'No featured milestone.')
			}
		},
	},
})

// Accepted without the hook: a task of any milestone, with none featured.
await Project.update(
	{ where: { id }, data: { featuredTask: { connect: { id: task } } } },
	{ as: master },
)
```

After, with no hook:

```ts
await Project.update(
	{ where: { id }, data: { featuredTask: { connect: { id: task } } } },
	{ as: master },
)
// VALIDATION_FAILED: Project.featuredTask needs a Task of the same milestone.

await Project.update(
	{ where: { id }, data: { featured: { disconnect: true } } },
	{ as: master },
)
// VALIDATION_FAILED, on featured while a featuredTask is linked:
// Project.featuredTask needs a Task of the same milestone.

await Project.update(
	{
		where: { id },
		data: {
			featured: { disconnect: true },
			featuredTask: { disconnect: true },
		},
	},
	{ as: master },
)
// Accepted.
```

Rejected:

- `MATCH FULL` on D-220's foreign key: it also refuses a parent with no
  target, the usual case.
- Emptying the target when a write empties the parent: a silent loss, where
  refusing names it, as D-220 rejects for a moved parent.
- A deferred check: PostgreSQL defers no check; a trigger would, for a rule
  the cascade's order already keeps.

## D-236: A many-to-many relation kept within the row's parent

Choice: amends D-220.

1. A `many` facing a `many` takes `within: 'project'`: every row it links
   has the row's `project`. That form only: both models' `project` is a
   required stored `one` to the same model. It is declared on one side and
   holds from both. The start refuses the others:
   `Note.tasks: within names project, a required one relation of Note and of
Task to the same model.`, `Note.tasks: within on a many names a field both
models share, as within: 'project'.`, `Note.tasks and Task.notes: within
goes on one side.` A `many` facing a `one` keeps D-220's
   `Project.tasks: within belongs on Task.project, which stores the key.`
2. The rule holds when either side changes: a write that links two rows,
   through `connect`, `create`, `connectOrCreate` or `set`, from either
   side, or changes the parent of a row that stays linked, on either side.
   A link the same write removes, or whose row it deletes, holds nothing.
3. The kernel checks it among the write's checks (D-99), as D-220 does, with
   D-220's issue: `Note.tasks needs a Task of the same project.`, on the
   relation the write gave (`tasks`, or `notes` from the other side), or on
   `project` when a parent change breaks a link. A check reads a row the
   write does not hold as it was before the write, as D-220's.
4. `postgres()` holds it too. The join table gets a required `project_id`,
   which each link takes from its row on the declared side, `Note`: the row
   the write inserts, or else the row as stored; each model gets a
   unique key on `(id, project_id)`; and the join two foreign keys,
   `(note_id, project_id)` to `note (id, project_id)` and
   `(task_id, project_id)` to `task (id, project_id)`, deferred as the others
   (D-98), `on update cascade`: a row moved carries its links' parent, and
   the other side's key refuses at commit a link left outside it. Its
   refusal, which a race alone reaches, is the issue on the declared
   relation. `migrate create` adds the column filled from the rows it links,
   then the keys, which fail when a row links outside its parent, and drops
   them with `within`.
5. `memory()` needs nothing more: its writes run one at a time.

Why: a many-to-many often links rows of one parent only, a note about tasks
of its project, and nothing stopped a link to another project's task. Each
application re-read the links after every write, one count per linked
model, as Master since the caller may not read the rows elsewhere; it
missed the targets' side, and two concurrent writes passed it. Before:

```ts
export const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		project: f.one(() => Project, { onDelete: 'cascade' }),
		tasks: f.many(() => Task, { inverse: 'notes' }),
	}),
}).with({
	hooks: {
		afterCreate: ({ record }) => sameProject(record),
		afterUpdate: ({ record }) => sameProject(record),
	},
})

const sameProject = async (note: { id: string; project: { id: string } }) => {
	const elsewhere = await Task.count(
		{
			where: {
				notes: { some: { id: note.id } },
				project: { isNot: { id: note.project.id } },
			},
		},
		{ as: master },
	)
	if (elsewhere > 0) throw new PublicError('NOT_SAME_PROJECT', 'Wrong project.')
}
```

After, with no hook:

```ts
export const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		project: f.one(() => Project, { onDelete: 'cascade' }),
		tasks: f.many(() => Task, { inverse: 'notes', within: 'project' }),
	}),
})

await Note.update(
	{ where: { id: note }, data: { tasks: { connect: [{ id: theirs }] } } },
	{ as: master },
)
// VALIDATION_FAILED, on tasks: Note.tasks needs a Task of the same project.

await Task.update(
	{ where: { id: task }, data: { project: { connect: { id: other } } } },
	{ as: master },
)
// VALIDATION_FAILED, on project while a note of the first project links it.
```

Rejected:

- The object forms, `{ campaign: 'id' }` and `{ stage: 'mainStage' }`: no
  case needs them on a `many` yet.
- Declaring it on both sides: one rule written twice, which could disagree.
- The kernel's checks alone: two concurrent writes pass them, as the hook.
- The join's keys without `on update cascade`: a write moving a row and
  every row it links, which the kernel accepts, would leave the join's
  `project_id` behind and be refused at commit.

## D-237: A relation's other side is named, and a `one` may have none

Amended by D-239.

Choice: amends D-37, D-87 and D-123.

1. A `one` without `inverse` stores the key: its column, foreign key and
   `onDelete` live on its side. Its target gets no field unless a relation
   of the target names it.
2. A `many` names its other side with `inverse`, which the types require: in
   one-to-many, the target's `one` that stores the key
   (`posts: f.many(() => Post, { inverse: 'author' })`); in many-to-many,
   the target's `many`, which names it back. A view (`from`, D-151) names
   none.
3. A one-to-one is a `one` naming the target's `one` with `inverse`. The
   side that names stores no key, and is optional; the side it names stores
   the key, unique, optional or not.
4. Nothing pairs by itself. Startup stops, with a message, on:
   - a `many` without `inverse`, from JavaScript or a cast:
     `User.posts: a many names its other side with inverse.`
   - a `one` whose `inverse` names a `many`:
     `Post.author: inverse names a many; drop it, User.posts names this side.`
   - a one-to-one whose two sides name each other: `User.profile and
Profile.user name each other; only the side that stores no key names the
other.`
   - a one-to-one whose naming side is required: `User.profile: the side of
a one-to-one that names the other stores no key, and is optional.`
   - two relations naming the same field, and a many-to-many whose sides do
     not name each other: `User.posts and User.drafts both name Post.author.`
   - an `inverse` naming no relation of the target to the model, as before
     (D-24, D-37).
5. Writes, reads and filters through a `one` without other side are those of
   any stored `one`: `connect`, `create`, `connectOrCreate`, nested `update`
   and `delete`, `is` and `isNot`, `include`. A nested `create` takes the
   target's whole input, `UserCreateInput` (GraphQL and OpenAPI name it
   `UserCreateNestedOneInput`, with no `Without…`), and a nested write from
   the target leaves the relation in the row's data.
6. A rule's `record` holds every `one` that stores the key (D-87): each one
   without `inverse`.
7. `within` (D-220) names a target's field that a `many` of the parent
   names: the parent's side tells which targets it holds. Otherwise startup
   stops: `Ticket.assignee: within names Member.org, which needs its other
side.` A many-to-many's `within` (D-236) needs the same of both models'
   `one` to the parent: `Desk.tickets: within names Desk.org, which needs its
other side.`
8. `defineRole` (D-123) names the user model's field `roles`, as it names
   its own `members`, `inherits` and `inheritedBy`: the user model declares
   `roles: f.many(() => Role, { inverse: 'members' })`; without it, the
   types of `defineApp` refuse the models and startup stops: `Role.members: inverse 'roles' is not a relation of User to
Role.` `defineRole` takes no `inverse`: the name it would give is fixed.

Why:

- Most `one` relations are read from their own side: a comment's author, an
  invitation's sender. D-37 made the target declare a `many` for each of
  them, which crowded central models (the user) and published, in each
  transport, a connection, filters and a count sort that nothing used.
- Pairing by itself paired whatever it found. Two `one` relations between
  two models, meant apart, became a one-to-one with a unique key no one
  asked for; a second relation between two models broke startup until one
  side named the other. Named sides read the same in every model, and the
  name lives where it decides something: on the side that stores nothing.
- Parse's pointer is one-sided; an application moving from Parse writes its
  pointers as `one` relations with no extra field.
- Which side of a one-to-one stores the key follows from the declaration,
  not from which side is optional: both sides may be optional (D-233 asked
  for it).

Rejected:

- `inverse: false` on a `one`, with pairing by itself kept: one more value,
  and the silent one-to-one stays.
- A `many` without `inverse` as a one-sided many-to-many (Parse's
  relation): a forgotten `inverse` on a one-to-many would store its rows in
  a join table, next to the key, with no error. To revisit, with its own
  option, if usage asks for it.
- Naming on both sides of a one-to-many: the `one` side would repeat what
  the `many` says.
- Refusing nested writes through a one-sided `one`: its target's row is an
  ordinary row, reached through the key the row stores.

Example, before:

```ts
const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => User),
		post: f.one(() => Post),
	}),
})
const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		// Only there because Comment.author needs a side.
		comments: f.many(() => Comment),
		profile: f.one(() => Profile, { optional: true }),
	}),
})
const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({ user: f.one(() => User) }),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ comments: f.many(() => Comment) }),
})
```

After:

```ts
const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => User),
		post: f.one(() => Post),
	}),
})
const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		profile: f.one(() => Profile, { optional: true, inverse: 'user' }),
	}),
})
const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({ user: f.one(() => User) }),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		comments: f.many(() => Comment, { inverse: 'post' }),
	}),
})

await Comment.create({
	data: {
		text: 'Hi',
		author: { connect: { id: ann.id } },
		post: { connect: { id: post.id } },
	},
})
await Comment.findMany({ where: { author: { is: { name: 'Ann' } } } })
```

## D-238: The types check the field names of `from` and `within`

Choice: amends D-151 and D-220.

1. A view's `from` names a `many` of its model that stores its rows. Any
   other name is a type error on the field, which lists the names allowed:
   `from: 'drawrs'` and `from: 'open'`, a view, fail on `defineModel`.
2. The target's side of a `within` (D-220), the string or the keys of its
   object, names a field of the target. Any other name is a type error on
   `defineApp`, where every model is typed, as an `inverse` already is
   (D-37): `relationError: "Ticket.team: within 'orgn' is not a field of
the target"`.
3. A name typed `string`, not a literal, fails as an unknown one does; a
   cast, or JavaScript, still reaches the startup checks, which are
   unchanged.

Why:

- A typo or a rename in these names showed only when the application
  started. `from` names a field of the model being declared, which its
  type already holds; the target's fields are typed on `defineApp`, the
  only place reading them is no cycle.

Rejected:

- Checking `within`'s target side on `f.one`, with completion: reading the
  target's fields while declaring makes the model types circular (#158).
- Checking that a view and the `many` it reads relate to the same model in
  the types: the target behind the thunk is the cycle above; startup says
  it.

Example, before: both start-time errors only.

```ts
const Desk = defineModel({
	name: 'Desk',
	fields: (f) => ({
		drawers: f.many(() => Drawer, { inverse: 'desk' }),
		open: f.many(() => Drawer, { from: 'drawrs' }), // compiles
	}),
})
const Ticket = defineModel({
	name: 'Ticket',
	fields: (f) => ({
		org: f.one(() => Org),
		team: f.one(() => Team, { optional: true, within: 'orgn' }), // compiles
	}),
})
```

After:

```ts
const Desk = defineModel({
	name: 'Desk',
	fields: (f) => ({
		drawers: f.many(() => Drawer, { inverse: 'desk' }),
		// Type error: Type '"drawrs"' is not assignable to type '"drawers"'.
		open: f.many(() => Drawer, { from: 'drawrs' }),
	}),
})
// Type error: relationError: "Ticket.team: within 'orgn' is not a field
// of the target"
defineApp({ database: memory(), models: [Org, Team, Desk, Drawer, Ticket] })
```

## D-239: An optional one-to-one moves from the side without the key

Choice: amends D-237.

1. When the side that stores the key of a one-to-one is optional, the side
   without the key moves it: `connect` empties the key of the row that held
   this one and points the connected row here; `create` empties it and
   writes the new row with the key; `disconnect` empties it. The row left
   behind stays, with no key, as a `disconnect` of a `many` leaves it.
2. The row left empty is written before the row that takes the key, so the
   unique key never holds the same value twice.
3. From the side that stores the key, connecting a row another row already
   holds stays a unique conflict, `UNIQUE_VIOLATION`: a write does not take
   a link from a row it does not name.
4. When the side that stores the key is required, nothing changes (D-37): a
   write that would leave a row without its side fails with
   `The Card it points to cannot be left without one.`

Why:

- D-237 lets both sides of a one-to-one be optional, but its writes from
  the side without the key still asked that the old row keep its side: a
  member could not change locker, though the locker may stand empty.
- A row whose key may be empty is left empty, as a `many` leaves the rows it
  disconnects; refusing the write only made the caller do it in two steps.

Rejected:

- Taking the row from its holder on a `connect` from the side that stores
  the key: it would empty a row the write does not name (D-233, closed).
- Deleting the row left behind: `delete: true` already says that.

Example, before:

```ts
// A member changes locker in two writes: the move fails with
// "The Locker it points to cannot be left without one."
await Locker.update({
	where: { id: old.id },
	data: { member: { disconnect: true } },
})
await Member.update({
	where: { id: ada.id },
	data: { locker: { connect: { id: spare.id } } },
})
```

After:

```ts
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		locker: f.one(() => Locker, { inverse: 'member', optional: true }),
	}),
})
const Locker = defineModel({
	name: 'Locker',
	fields: (f) => ({ member: f.one(() => Member, { optional: true }) }),
})

// The old locker is left empty.
await Member.update({
	where: { id: ada.id },
	data: { locker: { connect: { id: spare.id } } },
})
```

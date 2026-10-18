# ADR-0347: One operation vocabulary and a shared exposure plan

- Status: proposed
- Date: 2026-10-18
- Refines: ADR-0168 (read cardinality in Access), ADR-0294 (`publicWrites`), ADR-0317 (Access rules and
  `allowWithoutRule`), ADR-0318 (Hooks phases), ADR-0324 (REST exposure), ADR-0325 (GraphQL exposure), ADR-0341
  (command closures); applies ADR-0288
- Approval: scope and the four main choices made by the user on 2026-10-18 (DX review `docs/handoff/revue-dx.md`
  §2.1 and §2.3); record pending validation

## Context

The DX review found that one schema's `.with({ … })` speaks four vocabularies, and that exposure is written once per
transport. A read-only spike on `main` 8c9b725a confirmed it:

- **Four key sets for the same commands.**
  - REST and GraphQL use the 12 method names (`findMany`, `createOne`, …), with no group keys
    (`packages/rest-plugin/src/rules.ts:24`, `packages/graphql-plugin/src/rules.ts:24`).
  - Access rules use `read` (or `{ one, many, count, exists }`), `create`, `update`, `upsert`, `delete`
    (`packages/access-plugin/src/authoring/contracts.ts:196`).
  - `allowWithoutRule` uses `all`, `read`, `write` and `one`, `many`, `count`, `exists`, `create`, …, where `one` and
    `many` mean `findOne` and `findMany`, not a cardinality (`packages/access-plugin/src/allow-without-rule.ts:34`).
  - Hooks use `all`, `create`, `update`, `upsert`, `delete` (`packages/hooks-plugin/src/authoring/schema-mutation-contracts.ts:129`).
  - Core encodes the Access vocabulary in `can({ operation })` (`packages/core/src/runtime/enforcement/policy-query.ts:59`).
- **Plugin commands are split One/Many everywhere.** `softDeleteOne` and `softDeleteMany` need separate Access rules,
  Hooks and transport keys; `restoreOne` and `restoreMany` inherit nothing
  (`packages/access-plugin/src/runtime/operation-rules.ts:177`).
- **Native commands are not data.** They exist only as `OperationKind`, a reserved-name list
  (`packages/core/src/plugins/application-surface-contracts.ts:46`) and per-package tables. The transport descriptor
  of a plugin command carries no `target`, read/write flag or operation
  (`packages/core/src/runtime/schema-mutations/transport.ts:24`).
- **REST and GraphQL duplicate the exposure logic.** Both define the same built-in defaults table
  (`packages/rest-plugin/src/schema-routes.ts:35`, `packages/graphql-plugin/src/rules.ts:148`), rule normalizers,
  `isXMethodEnabled`, closure assertions, rule-key checks, `hide` parsers, operation filters, pagination parsing and
  two `publicWrites` assertions that disagree on what counts as a write
  (`packages/rest-plugin/src/exposure.ts:31`, `packages/graphql-plugin/src/exposure.ts:6`). Plugin Kit exports nothing
  for transport authors; both transports use only `definePluginOptionsParser` from it.
- **The developer writes exposure twice.** `rest: { … }` then `graphql: { … }`, with two `default`, two `hide`, two
  `publicWrites` and two `pagination`.
- **Exposed and refused.** A method exposed by a transport but refused to every non-Master caller (no Access rule,
  `allowWithoutRule` closed) still appears in OpenAPI and in the GraphQL schema. Nothing tells the developer.
- **Constraints.** A `.with` key has exactly one owner
  (`packages/core/src/plugins/schema-option-ownership.test.ts:14`), so REST and GraphQL cannot share one; transports
  cannot import Access and Core cannot name either; OpenAPI must not reveal access rules (ADR-0324 decision 7);
  Master callers over HTTP must keep their routes.

Budget measured by the spike: `/classes/` appears in 96 files and `rest:`/`graphql:` option keys in 91 (package
sources 10, package tests 28, E2E 9, examples 25, website 10, other 9).

## Decision

### 1. One vocabulary, four levels, defined by Core

Core defines one hierarchy of command keys, used by every rule-bearing plugin and by Core itself:

| Level     | Keys                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| all       | `all`                                                                                                                     |
| group     | `read`, `write`                                                                                                           |
| operation | `find`, `count`, `exists`, `create`, `update`, `upsert`, `delete`, and each plugin operation (`softDelete`, `restore`, …) |
| method    | `findOne`, `findMany`, `createOne`, `createMany`, …, and each plugin method (`softDeleteOne`, …)                          |

- `read` groups `find`, `count`, `exists`. `write` groups every other operation, request plugin operations included.
  Plugin permissions (Soft Delete's `readDeleted`) are not operations and belong to no group (ADR-0317 decision 7).
- The most precise key wins: method over operation, operation over group, group over `all`.
- Each consumer accepts the levels that make sense for it, and its types reject the others:
  - **Transports** (through `expose`, decision 2): every level.
  - **Access rules and `allowWithoutRule`**: one key set, every level except write methods. A write rule never
    depends on cardinality, so `createMany` cannot bypass a `create` rule (ADR-0168). Reads keep their one/many
    distinction through the methods `findOne` and `findMany`, which replace the grouped `read: { one, many, count,
exists }` form and the `allowWithoutRule` keys `one` and `many`. Group and `all` keys take the short rule form
    (a value or a function); the detailed `{ where, item }` form stays on operation keys.
  - **Hooks**: `all` and the write operations (`create`, `update`, `upsert`, `delete`, `softDelete`, …). There are no
    read hooks, so `read` and `write` are not accepted. `resolveInput` keeps its narrower set.
  - **`can({ operation })`**: the operation and read-method keys.
- **Plugin commands name their operation.** A command's name is `<operation>One` when `target` is `'one'` and
  `<operation>Many` when it is `'many'`; Core refuses another name, an operation that is a native operation or a group,
  and two commands of one owner that share a name. `softDeleteOne` and `softDeleteMany` therefore form the operation
  `softDelete`, and one Access rule or Hook covers both.
- **Core holds the commands as data.** A catalog describes each native method and each compiled plugin command:
  method, operation, group, cardinality (`one`, `many` or aggregate), effect, authority and owner. Rule normalizers,
  transports and diagnostics read this catalog instead of keeping their own tables.

### 2. One `expose` key, owned by Core

Core owns the schema rule `expose` and the application option `exposure`; both are protocol-neutral and name no
transport:

```ts
App.Schema.define({ className: 'Todo', fields }).with({
	access: { read: true, write: isOwner, softDelete: hasRole(Admin) },
	hooks: { afterCommit: { create: notify } },
	expose: { write: false, create: true, count: true },
})

new App({
	schemas: [Todo],
	exposure: {
		default: { count: true },
		publicWrites: false,
		hide: [authOperations.refresh],
		pagination,
	},
})
```

- `expose` takes `true`, `false`, or an object of the keys of decision 1 with boolean values. A key the schema
  does not set inherits `exposure.default`, then Core's built-in defaults: `findMany`, `findOne`, `exists`, `createOne`,
  `updateOne` and `deleteOne` open, everything else closed. Request plugin commands are closed until a key opens
  them; Master commands are never exposed.
- `exposure` replaces `restPlugin({ default, hide, pagination, publicWrites })` and the same four GraphQL options.
  `publicWrites` keeps the meaning of ADR-0294 and is checked once, by Core, for every installed transport.
- The `rest` and `graphql` schema keys keep only protocol settings (GraphQL's `typeName`) and `false`, which hides
  the schema from that one transport (ADR-0333). Transport plugin options keep only protocol settings (`basePath`,
  `openapi`, GraphQL `limits`, `schemas`, `sdl`).

### 3. Core plans exposure; Plugin Kit gives transports a reader

**Core** compiles one exposure plan at start, like the operations planner: for each protocol a transport asks for,
the exposed schemas, their exposed methods with their catalog entries, the exposed public operations (ADR-0324
decision 5, after `exposure.hide`) and the pagination limits. It applies, once, the defaults, command closures
(ADR-0341), per-protocol hiding and the `publicWrites` check. Core reads protocols as opaque strings that transports
pass, as it already does for owner bindings.

**Plugin Kit** exports a typed reader of that plan and its descriptor types for transport authors. REST and GraphQL
read the plan and keep only what is protocol-specific: routes and field names, wire codecs, OpenAPI and SDL. Their
defaults tables, rule normalizers, closure and `publicWrites` assertions, `hide` and pagination parsers are removed.

### 4. Access diagnoses exposed methods it always refuses

After `start()`, Access reads the exposure plan and reports every exposed method that it refuses to every non-Master
caller: no schema rule and no `allowWithoutRule` opening.

```text
Todo.deleteOne is exposed but no Access rule opens it.
Add an Access rule, open it in allowWithoutRule, or close it with expose: { deleteOne: false }.
```

- Outside production the report is a `warn` line per method; in production `start()` fails with the same list,
  as `allowWithoutRule: 'development'` does (ADR-0317, ADR-0312).
- An explicit rule, `false` included, is a decision and silences the report: a method meant only for Master callers
  over HTTP declares `delete: false`.
- Nothing changes on the wire: OpenAPI and the GraphQL schema still list every exposed method and reveal no rule
  (ADR-0324 decision 7), and Master callers keep their routes.
- This replaces the startup summary of ADR-0317 decision 6.

### 5. Out of scope

Command shapes and results (`updateMany`/`deleteMany` targets, Soft Delete input forms, one way to target a row,
DX review §4.1, §4.2, §4.5) go to a separate "commands" ADR; the trash semantics of `readDeleted` and Master (§4.4)
to another. ACL rights (`read`, `update`, `delete`) are row rights, not operations, and keep their names; their
`write` alias keeps its meaning, `update` and `delete` (`packages/acl-permissions-plugin/src/acl-contracts.ts:7`).

## Examples

What a developer writes before and after, from the repository's examples.

Exposing plugin commands (`examples/soft-delete/src/schema.ts:41`):

```ts
// Before: one rule per transport, one key per One/Many method
.with({ rest: { softDeleteOne: true, restoreOne: true }, graphql: { softDeleteOne: true, restoreOne: true } })
// After: every installed transport; the operation covers One and Many
.with({ expose: { softDelete: true, restore: true } })
```

Access on plugin commands (`examples/full-stack/src/schema.ts:113`) and groups in schema rules:

```ts
// Before
access: { read: ({ where }) => where.eq('readable', true), restoreOne: false, restoreMany: false }
// After
access: { read: ({ where }) => where.eq('readable', true), restore: false }
access: { read: true, write: isOwner, softDelete: hasRole(Admin) } // softDelete, more precise, wins over write
```

Fetching one row versus listing:

```ts
// Before
access: { read: { one: true, many: isAuthenticated } }
accessPlugin({ allowWithoutRule: { one: true, many: false } })
// After
access: { findOne: true, findMany: isAuthenticated }
accessPlugin({ allowWithoutRule: { findOne: true, findMany: false } })
```

Hooks (`examples/full-stack/src/schema.ts:122`); `restore` now also runs for each row of `restoreMany`:

```ts
// Before
hooks: { afterOperation: { delete: onDelete, purgeOne: onPurge, restoreOne: onRestore } }
// After
hooks: { afterOperation: { delete: onDelete, purge: onPurge, restore: onRestore } }
```

Shared transport options (`examples/graphql/src/app.ts:19`):

```ts
// Before: repeated for each transport
apiServer({
	rest: {
		pagination: { defaultTake: 20, maxTake: 100 },
		hide: [authOperations.refresh],
	},
	graphql: {
		pagination: { defaultTake: 20, maxTake: 100 },
		hide: [authOperations.refresh],
		explorer: 'graphiql',
	},
})
// After: shared options belong to the application, protocol options stay on the transport
new App({
	schemas,
	exposure: {
		pagination: { defaultTake: 20, maxTake: 100 },
		hide: [authOperations.refresh],
	},
})
apiServer({ rest: true, graphql: { explorer: 'graphiql' } })
```

Plugin commands:

```ts
archiveOne: command({ authority: 'request', effect: 'update', data }) // operation `archive`
archiveMany: command({ authority: 'request', effect: 'update', data, target: 'many' })
archive: command({ … }) // refused when the plugin is defined: the name must end in One or Many
```

DX costs: a schema is exposed alike on every installed transport (only `graphql: false` or `rest: false` hides it from
one), so a method cannot be opened on one transport only; pagination moves from the transport to the application;
group rules such as `write: isOwner` also cover plugin commands installed later; rule completions list more keys.

## Consequences

- One key means one thing in every `.with` member and plugin option; plugin operations cover their One and Many
  methods. Hovers and completions of the Access, Hooks, REST and GraphQL rule types change.
- Exposure is written once for every transport, and a third-party transport inherits defaults, closures, `hide`,
  pagination and `publicWrites` by reading the plan.
- A command whose name does not end in `One` or `Many` fails when the plugin is defined. Soft Delete
  already follows the convention; the Master-only email write of the auth plugin
  (`packages/auth-plugin/src/email.ts:131`) is renamed.
- An application that exposes a method without any Access rule fails to start in production until it decides.
- **Proof.** A vertical slice first: the catalog, `expose`, `exposure` and REST on one example, with compiled
  declarations, the DX audit against `main` and the form D bench on TypeScript 6 and 7 (the rule types gain group
  and operation keys). Then GraphQL, Access and `allowWithoutRule`, Hooks, and every repository consumer. Before the
  slice, a test pins how ACL rights apply to plugin write commands, which no current test covers.
- **Documentation impact:** both: the Access, Hooks, REST, GraphQL, Soft Delete and Build a Plugin pages, the examples
  and create-app templates, and this record.

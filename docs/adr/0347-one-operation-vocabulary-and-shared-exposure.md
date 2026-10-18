# ADR-0347: One operation vocabulary and a shared exposure plan

- Status: accepted
- Date: 2026-10-18
- Refines: ADR-0168 (read cardinality in Access), ADR-0294 (`publicWrites`), ADR-0317 (Access rules and
  `allowWithoutRule`), ADR-0318 (Hooks phases), ADR-0324 (REST exposure), ADR-0325 (GraphQL exposure), ADR-0341
  (command closures); applies ADR-0288
- Approval: scope, the four main choices, per-transport exceptions and transport-owned options made by the user on
  2026-10-18 (DX review `docs/handoff/revue-dx.md` §2.1 and §2.3); record accepted by the user on 2026-10-18

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

### 2. One `expose` key, owned by Core, with per-transport exceptions

Core owns the protocol-neutral schema rule `expose`. Each transport's own schema key takes the same keys and holds
the exceptions for that transport:

```ts
App.Schema.define({ className: 'Todo', fields }).with({
	access: { read: true, write: isOwner, softDelete: hasRole(Admin) },
	hooks: { afterCommit: { create: notify } },
	expose: { write: false, create: true, count: true }, // every installed transport
	graphql: { count: false }, // except GraphQL
})
```

- `expose` takes `true`, `false`, or an object of the keys of decision 1 with boolean values.
- `rest` and `graphql` take the same forms, plus their protocol settings (GraphQL's `typeName`); `false` still hides
  the schema from that one transport (ADR-0333).
- **Resolution, per transport and method:** the transport's own key decides when it names the method at any level;
  otherwise `expose` decides; otherwise the transport's `default` option; otherwise Core's built-in defaults
  (`findMany`, `findOne`, `exists`, `createOne`, `updateOne` and `deleteOne` open, everything else closed). An
  exception wins even when it is less precise: `expose: { count: true }` with `graphql: { read: false }` exposes
  `count` over REST and no read over GraphQL. Within one key, the most precise level wins (decision 1).
- Request plugin commands are closed until a key opens them; Master commands are never exposed.
- When a schema declares `expose` and no installed transport reads the exposure plan, `start()` logs one `warn` line:
  `Todo declares expose, but no transport is installed: it has no effect.`

### 3. Shared transport options, one plan in Core, one reader in Plugin Kit

Exposure options stay on the transports, so an application never carries options that no installed plugin reads, and
nothing suggests they apply to the server-side API (`pagination` does not bound `Todo.findMany()`).

- REST and GraphQL take the same `default`, `hide`, `pagination` and `publicWrites` options, with one shape defined in
  Plugin Kit; `publicWrites` keeps the meaning of ADR-0294.
- `apiServer()` takes these four options once for every transport it installs; a transport's own section holds the
  exceptions: each option it sets replaces the shared one as a whole, without merging:

  ```ts
  apiServer({
  	pagination: { defaultTake: 20, maxTake: 100 },
  	hide: [authOperations.refresh],
  	rest: true,
  	graphql: {
  		explorer: 'graphiql',
  		pagination: { defaultTake: 20, maxTake: 50 },
  	},
  })
  ```

- Without the preset, each transport is configured on its own, with the same shape.

**Core** compiles the exposure plan at start, like the operations planner. For each protocol a transport asks for, the
transport passes its parsed options and the owner of its schema key; Core returns the exposed schemas, their exposed
methods with their catalog entries, and the exposed public operations (ADR-0324 decision 5, after `hide`). It applies
the resolution of decision 2, command closures (ADR-0341) and the `publicWrites` check once, generically. Core reads
protocols as opaque strings that transports pass, as it already does for owner bindings, and names no transport.

**Plugin Kit** exports the shared option type and its parser, a typed reader of the plan and its descriptor types, so
a third-party transport gets the same options and rules. REST and GraphQL keep only what is protocol-specific: routes
and field names, wire codecs, pagination on the wire, OpenAPI and SDL. Their defaults tables, rule normalizers,
closure and `publicWrites` assertions, `hide` parsers and option parsers are removed.

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
// After: written once in the preset; a transport section holds its exceptions
apiServer({
	pagination: { defaultTake: 20, maxTake: 100 },
	hide: [authOperations.refresh],
	rest: true,
	graphql: { explorer: 'graphiql' },
})
```

One transport differs from the shared rule:

```ts
.with({ expose: { count: true }, graphql: { count: false } }) // count over REST only
.with({ rest: { count: true } }) // the same, written as an exception alone
```

Plugin commands:

```ts
archiveOne: command({ authority: 'request', effect: 'update', data }) // operation `archive`
archiveMany: command({ authority: 'request', effect: 'update', data, target: 'many' })
archive: command({ … }) // refused when the plugin is defined: the name must end in One or Many
```

DX costs: an exception on a transport wins over `expose` even when it is less precise, which the rule types' JSDoc
must say; without `apiServer()`, two transports repeat their shared options; `expose` is offered in `.with` even when
no transport is installed (a startup warning says it has no effect); group rules such as `write: isOwner` also cover
plugin commands installed later; rule completions list more keys.

## Consequences

- One key means one thing in every `.with` member and plugin option; plugin operations cover their One and Many
  methods. Hovers and completions of the Access, Hooks, REST and GraphQL rule types change.
- Exposure is written once for every transport, with exceptions per transport; a third-party transport gets the same
  options and rules from Plugin Kit and the plan.
- A command whose name does not end in `One` or `Many` fails when the plugin is defined. Soft Delete
  already follows the convention; the Master-only email write of the auth plugin
  (`packages/auth-plugin/src/email.ts:131`) is renamed.
- An application that exposes a method without any Access rule fails to start in production until it decides.
- **Proof.** A vertical slice first: the catalog, `expose`, the shared transport options and REST on one example, with compiled
  declarations, the DX audit against `main` and the form D bench on TypeScript 6 and 7 (the rule types gain group
  and operation keys). Then GraphQL, Access and `allowWithoutRule`, Hooks, and every repository consumer. Before the
  slice, a test pins how ACL rights apply to plugin write commands, which no current test covers.
- **Documentation impact:** both: the Access, Hooks, REST, GraphQL, Soft Delete and Build a Plugin pages, the examples
  and create-app templates, and this record.

## Implementation amendment (2026-10-18)

Accepted by the user on 2026-10-18. The read-only inventory for the vertical slice found five points where the record
is silent or cannot hold literally. Each is listed with what the developer sees. The slice audit added the sixth.

1. **The plan is compiled once, when the first transport asks.** REST compiles its routes and OpenAPI at application
   setup, before `start()`. Core compiles the exposure plan on the first request for a protocol and caches it; the
   checks that need a started application (`publicWrites`, the `expose` warning of decision 2) still run at `start()`.
   Nothing changes for the developer.
2. **`true` and group keys open request plugin commands.** `expose: true`, `all: true` and `write: true` open them, as
   `rest: true` does today; only an omitted key leaves them to the closed built-in default.

   ```ts
   .with({ expose: { write: true } }) // createOne, …, softDeleteOne and restoreOne
   .with({ expose: { read: true } }) // reads only; softDeleteOne stays closed
   ```

3. **An operation key exposes the methods a transport serves.** REST and GraphQL serve only one-row plugin commands
   today, so the operation key publishes the `One` method and the `Many` method key stays a type error in `expose`,
   `rest` and `graphql`, as it is in `rest` today:

   ```ts
   // Before
   .with({ rest: { softDeleteOne: true } })
   // After
   .with({ expose: { softDelete: true } }) // softDeleteOne over HTTP; softDeleteMany is not served
   .with({ expose: { softDeleteMany: true } }) // type error, as rest: { softDeleteMany: true } today
   ```

4. **`default` reaches `apiServer()` with GraphQL.** The slice adds the shared `hide`, `pagination` and `publicWrites`
   options to `apiServer()` and passes them to both transports, which accept them already. The shared `default`
   follows when GraphQL reads the plan, since its parser rejects group keys until then; a shared option must never
   reach one installed transport and silently skip the other.

   ```ts
   // Slice
   apiServer({
   	pagination: { defaultTake: 20, maxTake: 100 },
   	rest: { default: { count: true } },
   	graphql: true,
   })
   // After the GraphQL step
   apiServer({
   	pagination: { defaultTake: 20, maxTake: 100 },
   	default: { count: true },
   	rest: true,
   	graphql: true,
   })
   ```

5. **`.with` always offers `expose`.** The misuse message lists it beside `relations`, and a factory without any rule
   plugin accepts `.with({ expose })` instead of no rules:

   ```text
   Before: Post.with({ hooks }): hooks is not a rule of an installed plugin; .with accepts relations, access, audit
   After:  Post.with({ hooks }): hooks is not a rule of an installed plugin; .with accepts relations, expose, access, audit
   ```

6. **The hover of `SchemaRulesSource` spells out `RegisteredSchema<…>`.** Accepted by the user on 2026-10-18 after the
   slice audit. The `.with` signature now reads plugin commands for `expose`, so the declaration bundler moves the
   module of `SchemaRulesSource` into Core's shared chunk, where the editor expands the alias. The type is unchanged.
   Keeping the alias would take a private copy of the type and a dedicated module only to steer the bundler, and the
   hover of `ExposureCommandKey` would then show the private name.

   ```text
   Before: [RegisteredSchema<TClassName>] extends [never] ? TSchema : RegisteredSchema<TClassName>
   After:  [Extract<RegisteredSchemaUnion<TClassName>, SchemaDefinition<TClassName, …>>] extends [never]
             ? TSchema : Extract<RegisteredSchemaUnion<TClassName>, SchemaDefinition<TClassName, …>>
   ```

The `publicWrites` messages keep their wording: the shared check returns the exposed write methods and each transport
describes them in its own terms (routes for REST, root fields for GraphQL).

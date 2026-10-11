# @ultimabase/hooks-plugin

Optional official lifecycle Hooks for UltimaBase.

The package contains both the public authoring contract and its Runtime engine.
Importing it does not install behavior; add `hooksPlugin()` to the application
`.use()` chain. Field `hooks` are declared on fields; schema `hooks` live in the
final `.with({ hooks })` of a schema (ADR-0316) and are typed from the schema,
without generated files. The `hooks` option of `define` follows the same types
until the declaration form is retired.

```ts
import { UltimaBase } from '@ultimabase/core'
import { defineEvent, hooksPlugin, onEvent } from '@ultimabase/hooks-plugin'

export const postCreated = defineEvent<{ postId: string }>('post.created')

const App = UltimaBase.use(
	hooksPlugin({
		events: [onEvent(postCreated, ({ event }) => notify(event.payload.postId))],
	}),
)

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({
			required: true,
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		slug: field.string(),
	}),
}).with({
	hooks: {
		resolveInput: {
			create: ({ data }) => ({ ...data, slug: slugify(data.title) }),
		},
		beforeOperation: {
			update: ({ changes, originalItem }) => {
				if (changes.title !== undefined && originalItem.slug === 'home') {
					throw new PublicError('The home post keeps its title.')
				}
			},
		},
		afterOperation: {
			create: ({ context, item }) => {
				context.emit(postCreated, { postId: item.id })
			},
		},
		afterCommit: {
			create: ({ item }) => sendWelcomeEmail(item.title),
		},
	},
})
```

## Phases (ADR-0318)

| Phase                 | Runs                                            | Receives                                                                         |
| --------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Field `resolveInput`  | for a present non-null value                    | the field's `value` (returned value replaces it); `null` is stored without it    |
| Schema `resolveInput` | before validation, the update target locked     | `data` (create), `changes` and `originalItem` (update), both and `mode` (upsert) |
| `beforeOperation`     | before the write is stored                      | `item`, `originalItem`, `changes` (update), `mode` (upsert)                      |
| `afterOperation`      | after the write is stored, before commit        | the stored `item`, `originalItem`, `changes` (update), `mode` (upsert)           |
| `afterCommit`         | after the commit, outside the transaction       | the same input as `afterOperation`                                               |

Each phase takes `create`, `update`, `upsert` and `delete` branches (no
`delete` for `resolveInput`), plus `all`, which runs before the operation's own
branch. A branch is one callback or a non-empty ordered array. There are no
read hooks and no option to skip Hooks: Master bypasses authorization, never
Hooks.

`resolveInput` works on plain data and Core translates the result back into
the operation. `changes` lists only what an update changes; an atomic
operation stays an operation in readable form (`{ views: { increment: 1 } }`),
never rewritten into a value; a pointer change is the new Pointer; a relation's
link changes read `{ connect: [...ids], disconnect: [...ids] }`, a `set` shown as
its difference, join-table relations included. Link changes are read-only in
`resolveInput`. `resolveInput.upsert` returns `{ data, changes }`.

`item` and `originalItem` are plain frozen data (ADR-0310); acting on other
rows goes through the normal API, which joins the transaction and keeps the
authority.

## Transactions, replays and after-commit work

`resolveInput`, `beforeOperation` and `afterOperation` run inside the
transaction: a throw rolls everything back, and a `PublicError` reaches the
client (REST `400`, GraphQL `extensions.code`); any other error stays masked.
Core replays an automatic transaction after a transient `TRANSACTION_CONFLICT`
(ADR-0300), so these Hooks may run several times for one call: keep them free
of effects outside the transaction.

External effects belong in `afterCommit` or events. `afterCommit` runs after a
successful commit, outside the transaction, sequentially: global Hooks, then
the schema's `all`, then the operation's branch; a bulk call runs one
`afterCommit` per row after the whole transaction commits. The response does
not wait for it; a failure is logged and never rejects the call nor stops the
next Hooks. Delivery is best effort within the process. Tests await it with
`waitForAfterCommit()` from `@ultimabase/testing`.

## Typed events

`defineEvent<TPayload>(name)` creates an event bound by value;
`context.emit(event, payload)` queues it inside the transaction; consumers are
declared with `hooksPlugin({ events: [onEvent(event, handler)] })`, or by a
plugin with `provideHookEvent(contributionId, onEvent(...))`. Events are
delivered after commit like `afterCommit`: best effort, at most once, in this
process, not awaited by the response, a consumer failure logged. An event with
no consumer does nothing; a rolled-back transaction discards its events. A
consumer may use the normal API, which starts its own request. Durable
delivery (an outbox, retries) is left to a future queue plugin.

## Global Hooks

`hooksPlugin({ global })` declares the same phases and `all` for every schema;
callbacks receive a generic `item` and the `schema` name and run before each
schema's own Hooks.

## Recursion

A Hook may write through the normal API, which runs Hooks again (a child
completing its parent re-enters the same Hook). Nesting is bounded to 16
Hook-issued operations; beyond, the call fails with
`RUNTIME_CALLBACK_RECURSION`, rolls back, and the message shows the chain of
schemas and operations.

## Principal and public errors

`HookContext.principal` is the request principal resolved by Core
(`undefined` when anonymous) and stays the same under `useMasterKey`
(ADR-0304). A `PublicError` thrown after commit (an `afterCommit` Hook or an
event consumer) is only logged.

## Public surface

The root export has three deliberate groups:

- **Application API:** `hooksPlugin`, `HooksPluginOptions`, `HookContext`,
  `defineEvent`, `onEvent`, and the schema, field and global callback types
  used for explicit annotations.
- **Compatible-provider contract:** `hookContributionsCapability`,
  `provideHookContributions`, `globalHooks`, `schemaHooks`, `fieldHooks`,
  `readHookInternals`, the typed field-path and phase contracts, plus
  `hookEventContributionsCapability` and `provideHookEvent`.
- **Conformance support:** `hookDiagnosticsObserverCapability` and the redacted
  diagnostic event, owner, target, phase, and observer types.

Raw schema-option definitions, normalization functions, normalized declaration
storage, and Core-attributed `OwnedHookContribution` values are implementation
details. They are intentionally unavailable from the package root. Importing
the package still performs no registration or Runtime work.

Hooks contributed through `provideHookContributions` receive the same plain
data and may also read Core's internal tree with `readHookInternals(input)`:
the normalized `operation` and, during a nested write, the `nestedWrite` graph
shared by the root and every created child. Application Hooks do not receive
it.

The engine retains callback ownership through execution: inline schema Hooks
run as application callbacks, while capability-contributed Hooks run under the
exact contributing plugin instance. Nested queries inherit caller-selected
Master authority, but a contributed Hook that initiates a fresh Master
elevation must request `authority:elevate`; the Hooks plugin never lends its own
privileges to that provider.

Hooks checks cooperative cancellation through Core's public
`throwIfOperationCancelled()` helper before and after cancellable callback
boundaries. Independent behavior engines can use that same helper with their
own `AbortSignal`; it standardizes the `OPERATION_CANCELLED` failure but does
not detach or forcibly terminate running JavaScript.

JavaScript uses the same compiled graph and does not require Typegen. Omitting
the plugin means ordinary CRUD has no official Hooks lifecycle; adding a `hooks`
option without `hooksPlugin()` is an unknown-option application compilation
error. The packed PostgreSQL lifecycle is exercised by the
[`hooks-plugin-postgres.postgres.e2e.test.ts`](tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts)
and [`hooks-data-phases.postgres.e2e.test.ts`](tests/e2e/hooks-data-phases.postgres.e2e.test.ts)
suites.

## Plugin-owned schema mutations

Every installed schema mutation (Soft Delete's `softDeleteOne`, `restoreOne`,
`purgeOne`, …) adds its own branch to `beforeOperation`, `afterOperation` and
`afterCommit`. Both request and Master-only commands are present because
trusted maintenance operations still retain business Hooks:

```ts
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete()
	.with({
		hooks: {
			beforeOperation: {
				softDeleteOne: ({ context, input, item, originalItem, target }) => {
					console.log(context.requestId, input, target.id, originalItem, item)
				},
			},
			afterCommit: {
				softDeleteOne: ({ item, mutation }) => {
					console.log(mutation.name, item)
				},
			},
		},
	})
```

Before Hooks receive the validated payload, locked preimage, and owner-resolved
candidate. After Hooks receive the adapter-validated persisted pair before
commit. Delete effects expose `item` as `null`. `all` covers the native
operations only.

Dispatch uses the custom logical command, never its physical statement. A
`softDeleteOne` implemented by `update-one` therefore runs only its own branch;
it does not run native update or delete Hooks. Stale command keys fail at
startup, before Runtime work begins.

Compatible providers use the existing `schemaHooks()` and
`provideHookContributions()` factories. Their callbacks retain the provider's
own plugin identity and `runtime:intercept` privilege; the Hooks engine does not
lend the mutation owner's privileges.

Once all field, schema, and prepared-operation transformations finish, Core
runs one mandatory structural validation pass; when installed, the Validation
plugin then runs as the last step before storage. Hooks providers do not
register or own either validation boundary.

A provider declares Hooks as a peer rather than a lifecycle dependency,
because the Hooks engine consumes the provider's contribution capability:

```ts
plugin({
	id: 'community.workflow-hooks',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	contributions: [provideHookContributions(/* ... */)],
})
```

## Compatible-provider conformance

Providers can exercise the public engine without a deep import by making their
plugin the conformance subject and installing `hooksPlugin()` as support:

```ts
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing'

const suite = definePluginConformanceSuite({
	createFixture: () =>
		createPluginConformanceFixture({
			subject: workflowHooksPlugin(),
			supportPlugins: [hooksPlugin()],
			schemas: [Post],
		}),
	expected: {
		core: '^0.0.0',
		pluginId: 'community.workflow-hooks',
		version: '1.0.0',
	},
}).check('middleware', async ({ createUltimaBase }) => {
	const { ultimabase } = createUltimaBase()
	await ultimabase.start()
	await Post.createOne({ data: { title: 'Published' } })
	// Assert the provider's observable ordering and rollback contract here.
})

await runPluginConformance(suite)
```

`definePluginConformanceSuite`, `createPluginConformanceFixture`, and
`runPluginConformance` come from `@ultimabase/testing`; every Hooks symbol in
the example comes from this package root. Independent lifecycle engines are not
expected to run this official-protocol check.

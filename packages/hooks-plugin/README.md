# @ultimabase/hooks-plugin

Optional official lifecycle Hooks for UltimaBase.

The package contains both the public authoring contract and its Runtime engine.
Importing it does not install behavior; add `hooksPlugin()` to the application
`.use()` chain. Field `hooks` are declared on fields; schema `hooks` live in the
final `.with({ hooks })` of a schema (ADR-0316) and are typed from the schema,
without generated files; `define` takes no `hooks` option.

Every code block in this README except the conformance sketch is copied from
the tested [`examples/hooks`](../../examples/hooks/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
schema file installs the plugin with global Hooks and an event consumer, then
declares a `Post` with field and schema Hooks (`Author`, `Tag` and
`PostTitleChange` are plain schemas declared beside it; `sendMessage` stands
in for an e-mail or webhook client):

<!-- region ../../examples/hooks/src/schema.ts#factory,post -->

```ts
import { apiServer } from '@ultimabase/api-server'
import { PublicError, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

import { sendMessage } from './effects.ts'
import { announcePost, postPublished } from './events.ts'

/**
 * The configured factory types `.with({ hooks })` and field `hooks` from the
 * plugin declaration. `postgresPlugin()` reads `DATABASE_URL` at start.
 */
export const App = UltimaBase.use(
	hooksPlugin({
		// Runs for every schema, before the schema's own Hooks.
		global: {
			afterCommit: {
				all: ({ schema, kind }) =>
					sendMessage({ to: 'audit', subject: `${schema}.${kind}` }),
			},
		},
		// Consumers of typed events, run after the commit.
		events: [announcePost],
	}),
	softDeletePlugin(),
	// Hooks are not an authorization layer: every client may write here.
	// Install Access before exposing an application.
	...apiServer({ http: { appId: 'blog' }, rest: { publicWrites: true } }),
	postgresPlugin(),
)

const slugify = (title: string) => title.toLowerCase().replace(/\s+/gu, '-')

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		// A field Hook receives one present, non-null value.
		title: field.string({
			required: true,
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		summary: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		slug: field.string(),
		published: field.boolean({ default: false, required: true }),
		views: field.int({ default: 0 }),
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
	}),
	// A unique index of `define` is a unique target of `upsertOne`.
	indexes: [{ fields: ['slug'], unique: true }],
}).with({
	hooks: {
		// Plain data in, plain data out; `undefined` keeps the input.
		resolveInput: {
			create: ({ data }) => ({ ...data, slug: slugify(data.title) }),
			update: ({ changes }) =>
				changes.title === undefined
					? undefined
					: { ...changes, slug: slugify(changes.title) },
			upsert: ({ mode, data, changes }) =>
				mode === 'create'
					? { data: { ...data, slug: slugify(data.title) }, changes }
					: undefined,
		},
		beforeOperation: {
			update: ({ originalItem, item }) => {
				if (originalItem.published && item.title !== originalItem.title) {
					throw new PublicError('A published post keeps its title.', {
						code: 'post.published-title',
					})
				}
			},
		},
		// Inside the transaction: these writes and events commit with the post.
		afterOperation: {
			update: async ({ changes, context, originalItem, item }) => {
				if (changes.title !== undefined) {
					await PostTitleChange.createOne({
						data: {
							post: { connect: item.id },
							previousTitle: originalItem.title,
							title: item.title,
						},
					})
				}
				if (changes.published === true) {
					context.emit(postPublished, { postId: item.id, title: item.title })
				}
			},
		},
		// After the commit, outside it: external effects belong here.
		afterCommit: {
			create: ({ item }) =>
				sendMessage({ to: 'editors', subject: `New draft: ${item.title}` }),
			update: ({ changes, item }) =>
				sendMessage({ to: 'webhook', subject: item.id, body: changes }),
		},
	},
})
```

<!-- endregion -->

## Phases (ADR-0318)

| Phase                 | Runs                                        | Receives                                                                         |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Field `resolveInput`  | for a present non-null value                | the field's `value` (returned value replaces it); `null` is stored without it    |
| Schema `resolveInput` | before validation, the update target locked | `data` (create), `changes` and `originalItem` (update), both and `mode` (upsert) |
| `beforeOperation`     | before the write is stored                  | `item`, `originalItem`, `changes` (update), `mode` (upsert)                      |
| `afterOperation`      | after the write is stored, before commit    | the stored `item`, `originalItem`, `changes` (update), `mode` (upsert)           |
| `afterCommit`         | after the commit, outside the transaction   | the same input as `afterOperation`                                               |

Each phase takes `create`, `update`, `upsert` and `delete` branches (no
`delete` for `resolveInput`), plus `all`, which runs before the operation's own
branch. `all` also runs for plugin commands (Soft Delete's `softDeleteOne`,
`restoreOne`, `purgeOne`, their `Many` forms, community commands) with `kind`
naming the command; types narrow on `kind`. A branch is one callback or a non-empty ordered array. There are no
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
`t.afterCommit()` of `testApplication` from `@ultimabase/testing`.

## Typed events

The example's event and its consumer, installed by the factory above and
emitted by Post's `afterOperation.update`:

<!-- region ../../examples/hooks/src/events.ts#event -->

```ts
import { defineEvent, onEvent } from '@ultimabase/hooks-plugin'

import { sendMessage } from './effects.ts'

/** Emitted by a Hook when a post goes live; bound by value, not by name. */
export const postPublished = defineEvent<{ postId: string; title: string }>(
	'post.published',
)

/** Runs after the commit, without delaying the response. */
export const announcePost = onEvent(postPublished, ({ event }) =>
	sendMessage({
		to: 'subscribers',
		subject: `New post: ${event.payload.title}`,
	}),
)
```

<!-- endregion -->

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
schema's own Hooks. Global `all` also sees plugin commands, so its `kind` is
`string`.

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

JavaScript uses the same compiled graph. Omitting
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
trusted maintenance operations still retain business Hooks. The example's
`Comment` uses Soft Delete in command mode; its `afterCommit.all` narrows on
`kind`, and its reply cascade shows the depth limit of [Recursion](#recursion):

<!-- region ../../examples/hooks/src/schema.ts#factory,comment -->

```ts
import { apiServer } from '@ultimabase/api-server'
import { PublicError, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

import { sendMessage } from './effects.ts'
import { announcePost, postPublished } from './events.ts'

/**
 * The configured factory types `.with({ hooks })` and field `hooks` from the
 * plugin declaration. `postgresPlugin()` reads `DATABASE_URL` at start.
 */
export const App = UltimaBase.use(
	hooksPlugin({
		// Runs for every schema, before the schema's own Hooks.
		global: {
			afterCommit: {
				all: ({ schema, kind }) =>
					sendMessage({ to: 'audit', subject: `${schema}.${kind}` }),
			},
		},
		// Consumers of typed events, run after the commit.
		events: [announcePost],
	}),
	softDeletePlugin(),
	// Hooks are not an authorization layer: every client may write here.
	// Install Access before exposing an application.
	...apiServer({ http: { appId: 'blog' }, rest: { publicWrites: true } }),
	postgresPlugin(),
)

/**
 * A thread whose comments count their replies at every level: updating a
 * parent re-enters the same Hook one level up, until the root.
 */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		body: field.string({ required: true }),
		parent: field.pointer({ target: () => Comment }),
		replies: field.int({ default: 0 }),
	}),
})
	.softDelete({ mode: 'command' })
	.with({
		hooks: {
			afterOperation: {
				create: ({ item }) => countReply(item.parent),
				update: ({ changes, item }) =>
					changes.replies === undefined ? undefined : countReply(item.parent),
			},
			afterCommit: {
				// `all` also runs for Soft Delete's commands; `kind` names them.
				all: async (input) => {
					if (input.kind === 'softDeleteOne') {
						await sendMessage({
							to: 'moderators',
							subject: `Hidden: ${input.originalItem.body}`,
						})
					}
				},
			},
		},
	})

const countReply = async (parent: { readonly id: string } | null) => {
	if (parent === null) return
	await Comment.updateOne({
		where: { id: { eq: parent.id } },
		data: { replies: { increment: 1 } },
	})
}
```

<!-- endregion -->

Before Hooks receive the validated payload, locked preimage, and owner-resolved
candidate. After Hooks receive the adapter-validated persisted pair before
commit. Delete effects expose `item` as `null`. `all` runs for every command
before the command's own branch, with `kind` set to the command name;
`resolveInput` has no command form.

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
because the Hooks engine consumes the provider's contribution capability. Core
derives `runtime:intercept` from the contribution (`permissions` gives its
reason), and the peer range must accept the installed Hooks version, or the
application fails with `PLUGIN_PROTOCOL_INCOMPATIBLE`. The example installs
this plugin with `App.use(postRulesPlugin)` once `Post` exists; the return
annotation of the factory keeps the plugin's type out of the `Register` cycle:

<!-- region ../../examples/hooks/src/post-rules-plugin.ts#post-rules-plugin -->

```ts
import { PublicError } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import {
	provideHookContributions,
	schemaHooks,
	type SchemaHookContributionDefinition,
} from '@ultimabase/hooks-plugin'

import { Post } from './schema.ts'

/** A compatible plugin contributing one Post rule to the Hooks engine. */
export const postRulesPlugin = plugin({
	id: 'example.post-rules',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	permissions: {
		'runtime:intercept': 'Keeps published posts from being deleted.',
	},
	contributions: [
		provideHookContributions(
			'published-post-rule',
			// The return type keeps this plugin's type out of the Register cycle.
			(): SchemaHookContributionDefinition =>
				schemaHooks(Post, {
					beforeOperation: {
						delete: ({ originalItem }) => {
							if (originalItem.published) {
								throw new PublicError('Unpublish the post first.', {
									code: 'post.published-delete',
								})
							}
						},
					},
				}),
		),
	],
})
```

<!-- endregion -->

## Compatible-provider conformance

Providers can exercise the public engine without a deep import by making their
plugin the conformance subject and installing `hooksPlugin()` as support. This
sketch is not run: adapt the subject, the schemas and the support plugins your
check needs, such as a database provider:

```ts unverified
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'

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
`runPluginConformance` come from `@ultimabase/testing/plugins`; every Hooks symbol in
the example comes from this package root. Independent lifecycle engines are not
expected to run this official-protocol check.

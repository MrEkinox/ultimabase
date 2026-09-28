# Source-typed application authoring target

- Status: user-approved DX target; production migration requires issue 6301 evidence and ADR-0279
- Date: 2026-09-28
- Baseline revision: `3c130475`
- Milestone: 63

This document freezes the developer experience approved before milestone 63 so
implementation work cannot silently drift toward another facade, a permanent
compatibility bridge, or a second plugin installation path. Current shipped
behavior remains authoritative until the evidence gate and superseding ADR are
complete.

## Canonical developer experience

```ts
import { z } from 'zod'

import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

const Blog = UltimaBase.use(postgresPlugin({ url: process.env.DATABASE_URL! }))
	.use(softDeletePlugin({ defaultMode: 'explicit' }))
	.use(accessPlugin({ default: false }))
	.use(hooksPlugin())
	.use(validationPlugin())

export const Post = Blog.Schema.define({
	className: 'Post',

	fields: (field) => ({
		title: field.string({
			required: true,
			validation: z.string().min(3).max(200),
			hooks: {
				resolveInput: ({ value }) => value.trim(),
			},
		}),

		published: field.boolean({ default: false }),
	}),

	access: {
		read: true,
		create: {
			allow: true,
			item: ({ item }) => item.title.length >= 3,
		},
	},

	hooks: {
		afterOperation: {
			create: ({ item }) => {
				console.log(item.id)
			},
		},
	},
})

export const AuditLog = Blog.Schema.define({
	className: 'AuditLog',
	softDelete: false,
	fields: (field) => ({
		message: field.string({ required: true }),
	}),
})

export const application = new Blog({
	schemas: [Post, AuditLog],
})

await application.start()

const post = await Post.createOne({
	data: {
		title: 'Hello UltimaBase',
		published: false,
	},
})

await Post.softDelete({ id: post.id })
await Post.findMany()

await application.dispose()
```

The application name is developer-owned (`Blog`, `Shop`, `Api`, or another
domain name). `Backend` is not prescribed vocabulary.

`UltimaBase` itself is the zero-plugin configured factory. A portable Core-only
schema therefore follows the same mechanism rather than a second declaration
system:

```ts
export const PortableAddress = UltimaBase.Schema.define({
	className: 'PortableAddress',
	fields: (field) => ({
		city: field.string({ required: true }),
	}),
})
```

Application code uses its configured descendant (`Blog.Schema.define`), while
portable packages may use the zero-plugin root or export a configured factory.
Issue 6301 must prove compatible reuse and package-specialized schemas without
restoring a standalone competing schema compiler.

Plugin-defined field builders remain conditional on the configured factory.
For example, installing `pgVectorPlugin()` adds the current logical vector
field contract to that factory and nowhere else:

```ts
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const VectorSchemas = UltimaBase.use(pgVectorPlugin())

export const Embedding = VectorSchemas.Schema.define({
	className: 'Embedding',
	fields: (field) => ({
		value: field.vector({ dimensions: 1536 }),
	}),
})
```

Issue 6301 must prove completion, hover, diagnostics, value inference, and
plugin-absence behavior for this declaration. Physical PostgreSQL vector
storage is not currently shipped and is not added by this milestone; this
fixture is compile-time and static-compilation evidence, not a persistence
example.

## One public path per concern

| Concern                                      | Canonical target                                    |
| -------------------------------------------- | --------------------------------------------------- |
| Install and order a plugin                   | `UltimaBase.use(plugin())`                          |
| Declare a schema                             | `App.Schema.define({ className, fields, ... })`     |
| Configure one schema for an installed plugin | the plugin-owned direct option in `Schema.define()` |
| Register application schemas                 | explicit `new App({ schemas: [...] })`              |
| Execute schema and model commands            | the exact schema class or returned immutable model  |
| Start and dispose resources                  | the configured application instance                 |

The final public API has no `Schema.use()`, plugin map, plugin set, nested
plugin installation, automatic schema registration, required
`application.schemas.Post`, or ordinary repeated `{ ultimabase }` selection.
The old `new UltimaBase({ plugins: [...] })` installation form is removed rather
than retained as a second canonical path.

The standalone `Schema` namespace is not retained as an ordinary parallel
authoring API. Any low-level package specialization that cannot use the same
configured factory mechanism is an issue-6301 architecture stop, not permission
to preserve a second compiler.

## Bounded migration rule

The sequential issues may temporarily keep an old public entry point only while
repository consumers are moved. That overlap must delegate to the exact same
normalization, compilation, ownership, and execution implementation as the new
entry point. It is never documented as an alternative, never receives an
independent compatibility layer, and has a named removal owner: issue 6314.

Duplicating an internal graph, compiler, registry, binding, lifecycle path, or
type declaration to keep both forms alive is an architecture stop. The final
milestone contains neither the temporary old entry points nor migration-only
branches.

## Source typing contract

`App.Schema` carries the exact immutable plugin tuple accumulated by
`UltimaBase.use()`. Its `define()` keeps the existing object shape and retains
the exact field map instead of reducing the result to a class-name lookup.
Plugin definitions carry source-level type projections beside their one
Runtime declaration, without Core importing a concrete plugin.

The same source graph must provide exact completions, hovers, signatures, and
diagnostics for:

- Core fields, system fields, immutable models, create/update inputs, where,
  order, select, include, nested writes, pointers, relations, and virtuals;
- Access `item`, `originalItem`, `where`, operation and field declarations;
- schema and field Hooks, including plugin-provided mutation names;
- Standard Schema validation and plugin-defined fields such as vector;
- native CRUD, plugin schema mutations, model commands, application
  operations, Password User methods, Role schemas, and package-specialized
  schemas;
- source imports and packed-package imports, without a generated artifact.

An absent plugin must remove its option, field method, and command from editor
completion and produce a focused TypeScript diagnostic when used. Runtime must
still reject untyped JavaScript misuse through the same compiled ownership and
privilege checks.

## Runtime and security invariants

Schema declaration remains inert. It performs no setup, connection, server
work, authority selection, or automatic registration. Plugin privilege policy
is validated before static plugin effects, setup, Typegen replacement work, or
infrastructure materialization. The configured schema factory may expose type
information before that point, but Runtime declarations are compiled only
through the authorized application graph.

Direct schema calls resolve the sole active application in the JavaScript realm
and verify exact schema ownership on every call. Classes and models retain no
application resource, credential, adapter, transaction, or authority. Calls
before startup, after disposal, from a foreign configured application, or with
stale request state fail before effects. Concurrent requests retain their
request-local context, transaction, cancellation, subject, and Master
provenance.

Internal application handles may remain only where they protect Runtime
ownership or a current advanced capability. They are not a second ordinary
developer path and do not require a duplicate public surface.

## Typegen exit condition

The milestone is not complete while ordinary TypeScript authoring requires a
generated declaration, `typegenPlugin()`, a generation command, generated
module augmentation, or the `@ultimabase/typegen` workspace. Runtime already
treats generated output as replaceable; milestone 63 must remove the package
and superseded generated registries after every current contract is source
typed.

No reduced-capability fallback, manually maintained generated fixture, or
per-plugin ambient augmentation may be kept to claim completion.

## Complexity and performance gates

Issue 6301 records the old-form baseline before production changes by measuring
minimal, representative, and stress applications with 1, 10, and 50 schemas.
It measures Typegen regeneration and complete edit-to-diagnostic latency, cold
`tsc --noEmit`, language-service program creation, completion, QuickInfo,
diagnostics, declaration size, and peak heap across repeated isolated processes.

Unless the evidence issue records a stricter stable bound, the target must:

- keep median cold application typecheck and language-service initialization
  within 10% of the Typegen baseline;
- keep warm completion, hover, and diagnostic p95 within 15% of baseline and
  below 500 ms on the 50-schema fixture;
- keep measured peak TypeScript heap within 15% of baseline;
- retain concise named hovers rather than exposing recursively expanded
  implementation types;
- reduce total handwritten production lines below 122,645, reduce public
  exports below 1,720, and avoid increasing the 839,935-byte aggregate package
  declaration baseline;
- remove the 3,415 production lines and 28 public exports currently owned by
  `@ultimabase/typegen`, without moving equivalent generation machinery into
  Core.

The final audit distinguishes Core growth, plugin migration, removed Typegen,
tests, documentation, and net repository effects. A net reduction cannot hide
a new duplicate internal system.

## Architecture stop conditions

Stop and return for architecture review before production migration if the
proof requires any of the following:

- a second public plugin installation or schema composition form;
- a permanent facade over the existing generated registry or application
  handle system;
- Core importing Plugin Kit or a concrete plugin;
- plugin authors declaring the same public contract in independent Runtime and
  source-type registries;
- schema or plugin auto-registration through import side effects;
- mutation of exported schema classes or prototypes after definition;
- privilege checks moving after plugin effects;
- loss of an existing capability, security invariant, JavaScript behavior,
  transport projection, or community-plugin boundary;
- TypeScript latency, memory, hover readability, or declaration output outside
  the locked issue-6301 budgets.

## Mandatory issue audit loop

Every issue in milestone 63, including proof, ADR, documentation, and final
audit issues, must complete this loop before its dedicated commit:

1. Read the issue, accepted dependencies, this target, affected package
   contracts, current ADRs, documentation ownership, and Git state. Record the
   starting revision and relevant old-form baseline.
2. Implement only the issue criteria, required regression/type/editor tests,
   documentation, and removal of paths directly superseded by that issue.
3. Run the narrowest relevant checks first, then every broader gate required by
   the changed boundaries. Every issue runs `yarn validate:full` before
   completion.
4. Audit the complete issue diff from its starting revision, not only the last
   correction. Inspect behavior parity, security, authority, lifecycle,
   ownership, transactionality, plugin order/instances, TypeScript contracts,
   JavaScript behavior, source and packed exports, obsolete paths,
   documentation, examples, performance budgets, unnecessary abstractions,
   duplication, and scope.
5. Record every finding in the issue handoff using an iteration table. Correct
   every in-scope finding, rerun its affected checks, rerun every invalidated
   broader gate, and repeat the complete diff audit. There is no fixed retry
   limit and no finding may be waived.
6. A failed, skipped, interrupted, flaky, or unavailable required check keeps
   the issue `in-progress`. Diagnose it, add a regression when it reveals a
   defect, and rerun it successfully. Do not relabel a failure as unrelated
   without evidence, weaken an assertion, lower coverage, add an exclusion, or
   update a snapshot merely to obtain green output.
7. If a finding crosses an architecture stop condition, stop before broadening
   code and return the evidence and smallest options to the user. Do not add a
   bridge or alternate API to continue.
8. Only after every acceptance and test checkbox is proven, `yarn
validate:full` passes, documentation impact is classified, and the final
   audit has zero unresolved findings may the issue become `completed` and
   receive one dedicated local commit.
9. Inspect the committed diff and exact added/deleted/net lines, separating
   production, tests, generated artifacts, tooling, and documentation. A
   post-commit finding requires correction, complete re-audit, and amendment of
   that same unpushed commit. Never begin the next issue or push while a finding
   remains.

Issue 6316 must publish the complete final one-file developer form after its
milestone audit, from imports through disposal, with no temporary syntax. It is
compared directly with the canonical example in this document so the user can
identify any divergence before accepting the milestone.

Each handoff contains this table:

| Iteration | Finding or evidence | Correction or decision | Validation result | Remaining findings |
| --------- | ------------------- | ---------------------- | ----------------- | ------------------ |

Passing tests is necessary but not sufficient. A green audit is necessary but
not sufficient without all required tests. Both are mandatory.

## Final comparison

The milestone closes only with one old-versus-new audit containing the exact
authoring examples, capability matrix, production/test/documentation line
deltas, package and export removals, declaration bytes, Typegen regeneration
and edit-to-diagnostic latency, TypeScript latency and heap distributions,
editor assertions, Runtime/startup measurements, complete coverage, the final
cumulative one-file developer form, and `yarn validate:full` evidence.

# ADR-0211: Plugin options accept synchronous Standard Schema validators

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0045, ADR-0186

## Context

Plugin Kit's `definePluginOptionsParser` centralizes strict root validation,
plugin-owned normalization, and immutable results. Plugins that already use a
schema library must still wrap that library manually inside `normalize`, losing
direct input/output inference and repeating failure adaptation.

Standard Schema defines one validation and inference protocol implemented by
multiple schema libraries. Its validation method may return either immediately
or through a promise. UltimaBase plugin factories and static declarations are
deliberately synchronous: making this parser asynchronous would either turn
plugin factories into promises or defer invalid static configuration until a
later effectful phase.

## Decision

`definePluginOptionsParser` accepts two mutually exclusive definitions:

- the existing `keys` plus `normalize` definition, which retains Plugin Kit's
  strict root-key validation; or
- `schema`, containing one Standard Schema V1 validator whose inferred input
  and output types flow through the returned parser.

The Standard Schema variant calls `~standard.validate` directly. The schema
owns input validation, unknown-key behavior, defaults, and transformations. A
failure becomes one `TypeError` retaining all standardized issue messages and
paths. A promise or promise-like result fails explicitly because validation at
this boundary must be synchronous.

Successful schema output must be a plain object. Plugin Kit returns a detached,
shallow-frozen root exactly as it does for the normalizer variant. Nested values
remain governed by the plugin's schema contract.

`@standard-schema/spec` is a direct regular dependency of
`@ultimabase/plugin-kit` because its types occur in the public declarations. It
contributes no Runtime behavior. Plugin Kit does not depend on or re-export a
concrete validator such as Zod, Valibot, or ArkType.

## Consequences

- Plugin authors can reuse their chosen compatible schema without an adapter.
- Defaults and transformations preserve distinct inferred input and output
  contracts.
- Strict unknown-key rejection is explicit in the chosen schema rather than
  silently imposed by Plugin Kit's Standard Schema path.
- Async refinements are unsupported at static plugin-option boundaries.
- The existing manual API and diagnostics remain source-compatible.

## Non-goals

- Making plugin factories or static declarations asynchronous.
- Selecting a framework-wide validation library.
- Moving plugin option parsing into Core.
- Deep-freezing values whose ownership belongs to a plugin schema.

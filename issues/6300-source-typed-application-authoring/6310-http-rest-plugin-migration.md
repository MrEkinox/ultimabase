# 6310: Migrate HTTP, Hono, and REST configured installation

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, `@ultimabase/rest-plugin`
- Depends on: 6309
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Move the HTTP and REST stack to the configured application factory without
changing its safe dispatch boundary, application identity, protocol behavior,
or Runtime execution path.

## Baseline inventory

- Starting revision: `04839a6c`; the worktree was clean and `main` was ten
  commits ahead of `origin/main`. No push is authorized.
- HTTP already owns one public `appId`, original-header cardinality,
  application-bound request context, optional audited raw Master exchange,
  browser policy/preflight, deadlines, and a protocol-neutral safe pre-route
  error boundary. It publishes the narrow application request execution
  capability, not Core internals.
- Hono already has one optional HTTP owner, managed/external listener modes,
  post-shutdown safe dispatch, original Node header evidence, and matching
  resource disposal. REST already owns schema, operation, and mutation routes,
  Core AST normalization, field codecs, response/status mapping, and plugin
  operation projection.
- The remaining source-typing gap is REST's direct `rest` schema option: its
  declaration contribution returns no source receipt, so configured schemas
  depend on generated augmentation. HTTP and Hono add no schema authoring
  surface. Existing package tests still include constructor-plugin fixtures;
  issue 6314 owns repository-wide removal of that temporary constructor path.

## Architecture stop: configured nested-option hover

The bounded source/packed editor proof passes REST option completion,
diagnostics, and the exact `count: true` hover type without Typegen. The same
hover carries no JSDoc in either mode, while the existing generated REST option
test still retrieves `Generates the GET and POST count routes`. The configured
schema signature intersects an inferred `TDeclaredOptions` with its plugin
option validation, so TypeScript selects the literal property's symbol for
QuickInfo rather than the documented `RestSchemaRoutes.count` symbol. This is
a shared Core authoring-signature concern, not an HTTP or REST Runtime issue.

The change also moved the minimal example and initializer REST installation
into their schema factories, preserved one flat plugin chain, and migrated
focused HTTP/Hono/REST tests to `.use()`. The original editor test needed a
marker correction and a packed rebuild. A hover-documentation assertion then
exposed the architectural gap above. No Core or Runtime behavior changed.

The user accepted continuing this milestone without inline plugin-option
QuickInfo explanations; completion, diagnostics, and exact types remain
required. Record the missing JSDoc as a known DX limitation for issue 6316's
final limitation-by-limitation review. Do not widen Core's generic schema
signature or add a per-plugin documentation bridge without an explicit
decision. The existing Typegen descriptor remains live pending issue 6313,
and old constructor consumers remain assigned to issue 6314.

The user approved that bounded proof with the explicit constraint that Core
must not know `rest.count` or any other concrete plugin option and that the
investigation must not run for hours. In a small TypeScript 6.0.3 language-
service probe, a concrete contextual `Routes` parameter kept the documented
`count` hover. Generic parameters constrained by or intersected with the same
`Routes` type inferred the literal `count: true` symbol and lost its JSDoc.
A generic record restricted to selector-option names kept the unrelated REST
documentation, but widened the selector results (`'explicit' | 'disabled'`
and `boolean` instead of exact `'explicit'` and `false`). A single hard-coded
selector key could retain both, but cannot serve Core's arbitrary plugin
composition and would violate the approved boundary. These two bounded
approaches did not produce a safe generic fix. No Core file or Runtime path
was changed by this proof. The documentation limitation is accepted for now;
do not continue cycling through equivalent inference variants without new
evidence or a new architectural choice.

## Acceptance criteria

- [x] HTTP, Hono, and REST install through the same flat `UltimaBase.use()` chain with exact dependency, instance, ordering, privilege, and lifecycle behavior.
- [x] The sole active application owns the effective browser-origin policy, application identity, raw Master-key verification, auditing, and safe pre-route error boundary.
- [x] Infrastructure-only preflight remains the sole request that may omit application identity and invokes no application behavior.
- [x] Hono retains one optional HTTP owner, shutdown behavior, provider options, errors, and resource disposal without a shared-server application map.
- [x] REST preserves route coverage, normalization into the common operation/query AST, status and error mapping, selection, relations, files, authentication integration, and schema/plugin operation projection.
- [x] Transports receive only the narrow versioned application request execution capability and never receive Core internals or manufacture authority.
- [x] Source and packed types expose exact configured transport options and plugin operation surfaces without generated transport declarations.
- [x] Configured transport consumers do not need generated option declarations or a new bridge; still-used old-form descriptors and constructor consumers remain explicitly assigned to issues 6313 and 6314.
- [x] Package READMEs, examples, initializer, and public documentation are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing unit, type, editor, HTTP, Hono, REST, authentication, CORS, lifecycle, source-mode, packed, and PostgreSQL E2E suites migrate without dropped assertions.
- [x] Adversarial identity, credential, preflight, post-shutdown, and cross-application regressions.
- [x] Locked TypeScript and Runtime performance budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every installation, capability, route, request, identity, credential, preflight, error, provider, lifecycle, and documentation contract in the HTTP/REST stack.
- [x] Audit the complete diff for transport bypass, authority manufacture, application-map resurrection, unsafe pre-route errors, preflight behavior drift, route loss, AST divergence, resource leaks, transport-specific bridges, stale Typegen, and documentation drift.
- [x] Record each finding and correction in the handoff; rerun affected transport/security verticals plus the complete cross-transport audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; listener permission failures must be diagnosed and successfully rerun with the required environment.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- A new HTTP framework provider or REST feature.
- Transport access to `FrameworkEngine`, application facades, adapters, or authority.
- Shared-server multi-application routing.

## Audit loop in progress

| Iteration | Finding or evidence                                                                                                                                                                                                                                | Correction or decision                                                                                                                                                                                                                                                                                                                                        | Validation result                                                                                                                                      | Remaining findings                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 1         | REST's existing direct option registrar returned `undefined`, so the configured factory could not see `rest` without generated augmentation.                                                                                                       | Return its existing `defineOptions` source receipt and carry that type on `RestPlugin`; add isolated source/packed presence, absence, exact hover type, completion, and invalid-value diagnostics. No REST-specific Core type or Runtime branch was added.                                                                                                    | Focused source/packed editor tests pass.                                                                                                               | Broader gate pending.              |
| 2         | The minimal application and initializer installed REST only after declaring schemas, leaving their direct `rest` options on the old generated path.                                                                                                | Install REST once on each schema factory, then extend the same flat factory for Runtime transports and explicitly register schemas. Keep the existing operation allowlists.                                                                                                                                                                                   | Minimal generated output remained byte-identical; HTTP/REST/Hono and initializer focused tests, 8 built E2E tests, and 13 PostgreSQL E2E tests passed. | Broader gate pending.              |
| 3         | Configured nested `rest.count` hover retains `count: true` but loses the generated baseline's JSDoc. Two short generic-signature approaches did not preserve both documentation and exact selector literals.                                       | The user accepted this documentation-only limitation for the milestone. Keep it visible in issue 6316's final per-limitation audit; do not add a plugin-specific Core bridge.                                                                                                                                                                                 | Exact type, completion, and diagnostics pass in source and packed modes; both locked performance runs pass.                                            | No fix required within issue 6310. |
| 4         | The milestone execution checklist still showed completed issues 6307–6309 as open.                                                                                                                                                                 | Compared all 16 entries with issue statuses and commits, then checked only 6307–6309; 6310–6316 remain open.                                                                                                                                                                                                                                                  | Completed issue files have no unchecked criteria; milestone index now matches `CURRENT_PLAN.md`.                                                       | Broader gate pending.              |
| 5         | The first unrestricted full gate passed but branch coverage rounded down from 84.36% to 84.35% (14,762/17,499 versus 14,760/17,496). The HTTP-only initializer case was not covered.                                                               | Added a meaningful HTTP-without-Hono initializer case asserting its no-listener documentation.                                                                                                                                                                                                                                                                | Focused initializer test passes; final full coverage rerun passed.                                                                                     | None.                              |
| 6         | The additional complete built-E2E run exposed 13 failures: six 5-second language-service timeouts and seven packed Core archive hover assertions. Even though several stale expectations predated 6310, the issue could not close with a red gate. | Restored the configured `App.Schema.define` JSDoc on its actual declaration, updated all seven assertions to protect precise source-typed hovers instead of the obsolete generic fallback, and gave the built E2E project the same 20-second language-service headroom as source coverage. No product behavior, transport boundary, or assertion was removed. | Isolated Core archive: 22/22 passed. Unrestricted full built E2E: 101 files/405 tests passed.                                                          | None.                              |

The first sandboxed `yarn validate:full` and a diagnostic `yarn test` showed
Hono/Yoga listener failures only in the large parallel run; an isolated Hono
listener suite passed. Both incomplete runs were interrupted and are not
counted as passing. The gate was rerun with local-listener permission. After
the additional built-E2E findings were corrected, the final `yarn
validate:full` passed: 557 ordinary files/2,639 tests, 635 coverage
files/2,900 tests, and 17 website files/66 tests, with zero type or lint
errors. Exact coverage was 90.85% statements (23,878/26,281), 84.37% branches
(14,764/17,499), 96.04% functions (5,022/5,229), and 91.42% lines
(23,152/25,323). These totals match the preceding 6310 gate and exceed
issue 6309's 84.36% branch baseline. The separate complete built E2E check
also passed 101 files/405 tests on default concurrency; its earlier 13
failures are not waived.

The raw locked performance samples and comparisons against the original and
prior checkpoints are in
[`evidence/6310-http-rest-benchmark.md`](evidence/6310-http-rest-benchmark.md).

Final diff audit: the REST option now returns the already-authorized source
receipt; HTTP/Hono/REST request dispatch, identity, Master authority,
preflight, AST normalization, route/error mapping, resource ownership, and
plugin operation allowlists retain their existing paths. No Core import of
REST, transport execution bridge, Typegen registry, or new Runtime behavior
was added. The initializer and minimal application install REST exactly once
before declaring schemas and explicitly register those classes at application
construction. No used route or operation disappeared. The only scope added
beyond the original transport criteria was restoring configured Core `define`
hover documentation, correcting seven stale packed hover assertions, and
raising the built E2E language-service timeout to 20 seconds; these were
necessary to make the complete E2E gate pass, not new product APIs. Core's
schema examples were reviewed and already show the configured declaration
shape, so a code example change was unnecessary.

Documentation impact: `both`. The REST package README and public REST page
now teach configured `rest` option inference without Typegen; the HTTP page,
initializer README, and minimal example explain the same flat installation
form. The Hono README already used that form and needed no change. Remaining
old constructor consumers and still-used generated REST option descriptors
are explicitly owned by issues 6314 and 6313; this issue adds no new bridge.

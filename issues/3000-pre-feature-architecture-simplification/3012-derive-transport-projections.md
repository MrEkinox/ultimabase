# 3012: Derive REST and GraphQL transport projections

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/rest-plugin`, `@ultimabase/graphql-plugin`, command-owning plugins
- Depends on: 3011
- ADR: ADR-0261 refines the compilation/binding phases of ADR-0259 refining ADR-0240

## Goal

Derive static REST and GraphQL metadata and late executable allowlists from one
canonical command record so planning and execution cannot drift.

## Acceptance criteria

- [x] Core exposes an inert transport projection containing only the protocol's
      required identity, schema, command, authority, error, input, output, and
      owner facts.
- [x] Late execution resolves the exact same canonical command identity and
      private codec or handler reference; no separately contributed execution
      binding can be absent, duplicated, stale, or foreign.
- [x] REST retains current short Password Auth paths, generated schema-mutation
      paths, codecs, limits, safe errors, response envelopes, and authorization
      neutrality.
- [x] GraphQL retains current operation fields, schema-derived signup inputs,
      schema mutations, generated types, custom schema composition, execution,
      and authorization neutrality.
- [x] Master-only commands remain absent from public transports and transport
      metadata cannot grant authority or reveal executable callbacks.
- [x] Superseded operation and schema-mutation transport planners, binding
      registries, comparison code, and unused-binding failure modes are removed.

## Tests

- [x] REST, networkless GraphQL, Yoga, Password Auth, Soft Delete, public errors,
      codecs, JavaScript, packed packages, cross-transport parity, browser, and
      PostgreSQL E2E pass.
- [x] Ownership, duplicate, unknown protocol, malformed metadata, private
      callback, and Master exclusion regressions pass.

## Audit gate

- [x] Audit each public route and GraphQL field back to one canonical command,
      then run a source-removal audit for every old planner and binding path.
      Correct and repeat both audits until green.
- [x] Record route/schema parity, startup, line, file, test, duration, and
      Documentation impact evidence before completion.

## Out of scope

- Adding a transport, route alias, operation, schema mutation, or authorization
  rule.

## Implementation and audit notes

The existing Core-owned planning facade and late request-execution facade remain
separate lifetime boundaries. Both derive the exact same inert descriptors from
canonical commands and their private materialized bindings. Weakly keyed derived
views preserve identity without another registration or validation authority.
Schema mutation traversal reads canonical aliases in compiled schema/name order;
it no longer reconstructs commands through public legacy surface lookups.

Removed: the planner's binding contribution list, schema registry and surface
resolver; duplicate operation/mutation descriptor builders; schema-mutation
unused-binding scanning; the now-unused Runtime mutation binding readers; and
GraphQL's deep metadata/owner comparisons and planned-to-executable descriptor
mapping. GraphQL retains protocol, selection, exact descriptor identity and
lifecycle guards. REST's route-to-exposure checks remain necessary for its
separately public route-fragment input; they do not revalidate binding ownership.
No public capability, factory signature, route, field, codec or authority API
is added or replaced.

The explicit acceptance criterion removing unused-binding failures means a
mutation provider without selected aliases stays dormant. Its factory alone
cannot create a route. The Core README and public plugin-authoring website
explain that behavior and descriptor identity. Password Auth, Soft Delete and
REST require no production change; their existing public routes, schema-derived
payloads and policy semantics remain governed by the same inputs.

Documentation impact: both.

The audit follows both command kinds from canonical records through attributed
planning, exact protocol bindings, selected descriptors and Runtime decoding.
Metadata remains frozen JSON; owner and duplicate validation still happens once
at materialization. Mutation plans retain authority facts; REST and GraphQL keep
their existing Master exclusion and per-schema exposure checks. Private execution
references never enter the public plans. Stale contexts, disposal and cancellation
still fail before owner codecs or database work.

New regression coverage checks repeated operation descriptor identity, identical
planned/executable mutation objects and schema order, forged-descriptor rejection
before database effects, absent legacy schema-surface access, and dormant bindings
with no selected aliases. Existing tests retain unknown protocol, malformed
metadata, exact owner/instance, duplicate binding and Master exclusion coverage.

Initial validation found an unused import and an isolated-declaration annotation
needed for the new private projection. Both were corrected. The first cross-package
GraphQL tests used the preceding built Core; after rebuilding, all 39 focused tests
pass. No production behavior workaround was added for that stale-artifact failure.

## Validation evidence

Final audit: no unresolved finding. No duplicate descriptor builder, obsolete
schema-mutation binding reader, planner contribution list, unused-binding scan,
GraphQL structural comparator or selected-descriptor translation table remains.
Public projection shapes and export names remain unchanged.

- `yarn typecheck`: passed, including the final test additions.
- `yarn build`: passed in 35.861 seconds, including `attw` and `publint`.
- Focused planning/execution checks: 8 files / 39 tests passed.
- `yarn test --maxWorkers=2`: 534 files / 2,535 tests passed, zero type
  errors, 230.29 seconds.
- `yarn test:e2e:built --maxWorkers=2`: 97 files / 381 tests passed,
  177.41 seconds. This covers REST, networkless GraphQL, Yoga, browser explorers,
  Password Auth, Soft Delete, public errors, packed declarations, JavaScript,
  PostgreSQL, Master exclusions and cross-transport behavior.
- `yarn website:validate`: 17 files / 66 tests passed.
- Full lint, constraints, issue metadata, formatting and diff checks pass.
  Existing file-size warnings remain; no hard limit or baseline increased.
- Full coverage and the website production/browser build were not rerun. CI,
  coverage thresholds/exclusions and timeouts remain unchanged. The complete
  Core checkpoint remains issue 3014.

Measurements: 704 production TypeScript files / 127,887 lines; Core 339 files /
68,784 lines. Against 3011 this is **+1 production file / -111 lines**: Core
-41 and GraphQL -70. Tests/support remain 708 files / 130,620 lines, **+51
lines**. Public exports stay **1,726**, declarations **858,980 bytes**. The
shared projection file replaces duplication used by two concrete consumers;
there is no speculative new API. Full commit counts include tests and docs.

Quiet 20-lifetime startup/read/mutation medians are **1.622 / 0.415 / 0.528 ms**;
heap medians **8,970,056 / 9,994,104 / 10,190,776 bytes**. The no-product scenario
executes no plugin command, so these values establish no transport speedup.
Concurrent local suite timings establish no CI speedup. Measurements reference
the preceding HEAD plus this issue's working tree.

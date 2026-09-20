# 3010: Migrate schema mutations to the canonical graph

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/soft-delete-plugin`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 3009
- ADR: ADR-0261 refines the compilation/binding phases of ADR-0259 and retained schema-mutation semantics from ADR-0245

## Goal

Run explicit Soft Delete and private restoration and purge through the canonical
command graph while preserving generic schema-mutation, policy, Hooks, and
transaction semantics.

## Acceptance criteria

- [x] Schema-mutation definitions, target ownership, authority, payload,
      selected effect dependencies, handler, returning phase, errors, and
      surfaces compile into one canonical command.
- [x] Explicit soft delete remains its own logical mutation; replace-delete
      remains a physical rewrite of native delete; restore and purge remain
      private audited Master commands.
- [x] Existing tombstone visibility, non-disclosing target behavior,
      transactionality, relations, hooks, Access keys, and protected constraints
      remain unchanged.
- [x] Access and Hooks derive generic command identities without importing or
      naming Soft Delete vocabulary.
- [x] The plugin remains independent from Access, Hooks, REST, GraphQL, Yoga,
      PostgreSQL, and database implementations.
- [x] Legacy schema-mutation declarations may remain only as a temporary adapter
      into the canonical graph and may not retain a second Runtime registry.

## Tests

- [x] Direct TypeScript, JavaScript without Typegen, Access, Hooks, Master,
      relations, rollback, cancellation, REST, GraphQL, Yoga, packed, and
      PostgreSQL Soft Delete suites pass.
- [x] Generic community-style schema mutation tests prove Core remains
      product-neutral.

## Audit gate

- [x] Audit the complete mutation pipeline for changed logical identity,
      authorization coupling, existence disclosure, transaction escape,
      duplicate registration, and product vocabulary. Correct and repeat until
      green.
- [x] Record behavior, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- Adding deletion timestamps, deleted reads, public restoration, or another
  Soft Delete feature.

## Implementation and audit notes

Schema-mutation Runtime now receives the exact canonical mutation record rather
than a legacy schema-surface wrapper. Admission checks application schema
ownership, exact command identity, the selected schema-local alias, envelope
identity and query target before authority resolution or transaction effects.
The existing logical pipeline reads authority, dependency selection, owner,
effect family, declared errors and returning phase from that record.

Direct schema/class/model methods and wire transports share one payload and
projection preparation boundary. Private source callbacks live only with the
canonical graph. The old `schemaMutationSources` WeakMap and
`readPluginSchemaMutationSource()` lookup are removed. The graph's derived alias
views retain existing public signatures and metadata; they accept no independent
registration and do not decide execution ownership.

The static transport planner changes only its binding lookup to allow removal
of that obsolete source table. Its plan shape, exposure rules, ordering and
unused-binding check remain intact for 3012. The developer surfaces and generic
Access/Hooks catalog retain their existing derived view for 3011; none is a
second Runtime authority. No concrete plugin implementation changes, no
permission or policy name enters Core, and no Soft Delete feature is added.

The audit reviewed canonical and alias identity, exact instance/field ownership,
logical-versus-physical identity, hidden targets, before/after materialization,
Master before target lookup, unchanged authority audit reasons, transaction and
cancellation ordering, immutable output, codecs and private sources. One finding
was corrected: the first transport adaptation read projection properties before
payload validation. The shared builder now receives the projection object
without copying it and snapshots the payload first, preserving the previous
order. A wire regression with a throwing projection getter protects that order.
Its initial fixture omitted `transport:expose`; declaring the required privilege
fixed the fixture without changing production enforcement.

New regressions reject copied commands, forged definition facts and aliases
installed only on another schema before database work. A valid canonical
command reaches the same non-disclosing missing-target result with rollback,
even when the legacy public surface lookup is unavailable. Pure graph tests
protect private mutation snapshots and cross-graph/view provenance.

Documentation impact: internal engineering documentation.

Reviewed the Core, Soft Delete, Access and Hooks READMEs, the website ownership
map, and the website Soft Delete and Operations/GraphQL pages. Their command
names, payloads, selections, permissions, modes, errors, transport contracts and
lifecycle instructions remain accurate; no public migration or page edit is
needed. Root architecture, active plan and removal history record the internal
change. No schema implementation or schema example behavior changes.

## Validation evidence

Final audit: no unresolved finding. The payload/projection ordering correction
is protected by a passing wire regression and the final complete suites.

- `yarn typecheck`: passed after the final correction.
- `yarn build`: passed in 37.344 seconds. The final Core rebuild after that
  correction passed in 866 ms plus `attw`/`publint` validation.
- `yarn test --maxWorkers=2`: 534 files / 2,533 tests passed, zero type
  errors, 197.60 seconds. Source, JavaScript, editor, Access, Hooks, cancellation
  and generic community-style mutation suites pass.
- `yarn test:e2e:built --maxWorkers=2`: 97 files / 379 tests passed,
  152.35 seconds. Packed packages/editors, PostgreSQL, relations, protected
  visibility, private Master administration, rollback, REST, GraphQL and Yoga
  remain green.
- Focused mutation validation passed 18 files / 66 tests before the new
  regression. The final broad run includes that regression and its correction.
- Full lint and final changed-file lint pass; warning-only file-size notices
  remain. No hard limit or baseline increased.
- Constraints, issue metadata, formatting and diff checks pass.
- No public website page changed, so website build/tests were not rerun.
  Complete coverage was not rerun; thresholds, exclusions, timeouts and CI
  configuration remain unchanged. Concurrent local suite timings establish no
  claimed CI speedup.

The measurement script reports 703 production TypeScript files / 127,999 lines,
including Core's 338 files / 68,826 lines: **+1 file and +50 production lines**
from 3009. Tests/support reach 708 files / 130,481 lines: **+1 file and +241
lines**. Public exports remain **1,726**, and declarations remain **858,344
bytes**. Exact added/deleted/net totals from the dedicated commit include every
test and engineering document and are reported after creating it. This bounded
migration removes the old source table and execution reads; remaining derived
surface/projection adaptations belong to 3011–3013.

The quiet 20-lifetime no-product sample reports median startup/read/mutation
**1.690 / 0.411 / 0.503 ms**, with heap medians of 8,972,760 / 9,996,192 /
10,192,920 bytes. It exercises no plugin command and establishes no speedup.
Measurement revisions identify the preceding HEAD plus this issue's working tree.

# 3306: Audit behavioral and authoring parity

- Status: completed
- Milestone: 33
- Packages: repository-wide
- Depends on: 3305
- ADR: ADR-0269

## Goal

Remove temporary authoring bridges, measure the simplification, and prove that
the migration changed no product behavior.

## Acceptance criteria

- [x] Only one public Core-native plugin construction path remains.
- [x] No removed Plugin Kit or Core authoring path survives as an alias or documented alternative.
- [x] The open-plugin fixture demonstrates every retained kernel power with less registration duplication.
- [x] Before/after source, export, declaration, and authoring-step counts are recorded.
- [x] Public and engineering documentation show the canonical path exclusively.

## Audit

The comparison baseline is `64f31ea0`, the last commit before Milestone 33.
Line counts include the complete named source files, including comments and
whitespace, so the figures are reproducible with `git show` and `wc -l`.

| Measure                                                                           |              Before |       After |    Change |
| --------------------------------------------------------------------------------- | ------------------: | ----------: | --------: |
| Public owner of foundational plugin construction                                  | Core and Plugin Kit |        Core | one owner |
| Accepted capability input forms                                                   |    grouped and flat |        flat |    2 to 1 |
| Low-level operation/mutation provider factories exported from the Core root       |                   7 |           0 |        -7 |
| Foundational Plugin Kit runtime exports                                           |                   3 |           0 |        -3 |
| Associated foundational Plugin Kit type exports                                   |                   9 |           0 |        -9 |
| Official production source files importing foundational authoring from Plugin Kit |                  17 |           0 |       -17 |
| Plugin Kit foundational wrapper source                                            |           481 lines |     0 lines |      -481 |
| Password Auth authoring source                                                    |         1,265 lines | 1,224 lines |       -41 |
| Soft Delete authoring source                                                      |           442 lines |   388 lines |       -54 |
| Open-kernel workflow fixture                                                      |           254 lines |   240 lines |       -14 |

The 17 Plugin Kit consumers comprise 16 official plugin entry points plus the
ACL plugin's public contract file. Optional higher-level Plugin Kit helpers for
events, option parsing, schema patches, and contextual fields remain intact.

For one owned application operation with a handler, one transport binding, and
reachable Typegen types, five separately authored wiring artifacts collapsed to
one `contributeOperation()` entry: handler wrapper, handler provider, operation
registrar call, binding provider, and Typegen registrar call. The equivalent
schema-mutation path collapsed four artifacts to one
`contributeSchemaMutation()` entry. Codec and operation definitions remain
explicit because they express real contracts rather than registration
plumbing.

The repository-wide migration also removes the temporary grouped-capability
bridge from TypeScript and JavaScript fixtures. Runtime tests now reject grouped
input, and the Core root no longer exports the low-level handler/provider
factories that previously offered a parallel authoring path. Their protocols
remain private implementation details, so compiled graph behavior and lifecycle
semantics are unchanged.

## Tests

- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`, `yarn test:e2e:built`, `yarn test:coverage`, `yarn website:validate`, and `yarn check:issues` pass or any unrelated baseline failure is documented with evidence.

## Handoff

- Documentation impact: both. Core, Plugin Kit, Access, ACL, GraphQL, and HTTP
  package contracts plus the public plugin-authoring, Hooks, and Roles guides
  now show only flat capabilities and Core-owned operation contributions.
- Validation: `yarn constraints`; `yarn typecheck`; `yarn test` (540 files,
  2,558 tests); `yarn lint` (zero errors and 49 pre-existing file-budget
  warnings); `yarn build`; `yarn test:e2e:built` (98 files, 387 tests);
  `yarn test:coverage` (615 files, 2,805 tests, 90.52% statements, 83.98%
  branches, 95.78% functions, and 91.13% lines); `yarn website:validate` (17
  files, 66 tests); and `yarn check:issues`.
- The packed-application audit found and corrected two stale artifacts from the
  preceding Password Auth session work: duplicate `AppUser` generation and an
  incomplete packed public-API classification. Generated declarations were
  refreshed; their added Password Auth operations are the already-approved
  `change-password` and `logout-everywhere` contracts.
- No implementation exceeds the authorized goal. The audit fixes above were
  necessary to make the required repository-wide parity suite pass and did not
  add a capability, option, or alternate authoring path.

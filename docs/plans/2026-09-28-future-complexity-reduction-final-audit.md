# Future complexity reduction final audit

- Milestone: 62
- Baseline: `b1bc0ffb`
- Scope: issues 6201–6207
- Status: completed

## Measured result

| Measure                      |      Baseline |         Final |      Delta |
| ---------------------------- | ------------: | ------------: | ---------: |
| Handwritten production files |           714 |           717 |         +3 |
| Handwritten production lines |       122,475 |       122,645 |       +170 |
| Core production lines        |        66,784 |        67,022 |       +238 |
| Test files                   |           741 |           744 |         +3 |
| Test lines                   |       133,314 |       133,750 |       +436 |
| Public package exports       |         1,736 |         1,720 |        -16 |
| Core declaration output      | 592,396 bytes | 592,149 bytes | -247 bytes |

The production increase is concentrated in the typed ownership and schema
specialization boundaries. It replaces public construction paths and unsafe
type bridges rather than adding product behavior. Tests, ADRs, examples, and
public documentation account for most of the repository-wide line growth.
Across the final tree, the baseline-to-final diff contains 3,384 additions and
1,597 deletions across 311 files, a net change of 1,787 lines.

## What changed

1. `yarn validate` and `yarn validate:full` are the only ordinary and complete
   validation contracts used locally and by full CI selection.
2. `UltimaBase` is the sole public application owner. Internal application and
   request engines no longer form a parallel construction API.
3. `Schema.defineSpecialized()` is the one Core-native package boundary for
   schema statics and persisted-result commands. Password Auth and Roles no
   longer cast their schema classes through `unknown`.
4. Owner-private storage is an exact five-operation addressable-record
   boundary. Its adapter requests are discriminated unions rather than one
   optional-field envelope.
5. PostgreSQL direct, prepared, and rewritten mutation paths remain distinct
   where their invariants differ, while singular and collection create
   preparation now share one cardinality-aware builder.
6. Core's root no longer exposes direct capability-inventory construction or
   an aggregate asynchronous context API. Existing inspection and contextual
   values remain available through their canonical focused owners.
7. The [current architecture index](../current-architecture.md) maps maintained
   concepts to contracts, responsible code, and accepted ADRs, with an
   executable link and status guard.

## Developer experience

The milestone removes choices at the points where contributors previously had
to know repository history: which validation command was complete, which
application object owned Runtime, which schema-specialization primitive to
select, which fields existed on a private-storage request, which PostgreSQL
create helper to change, which Core context surface to import, and which ADR
still described the current design.

No convenience facade was placed over a duplicate internal system. The old
paths were removed, official packages were migrated to the same public
contracts available to community packages, and source plus packed-package
tests protect the resulting boundaries.

## Preserved capabilities

- all existing Schema, Query, application operation, schema mutation, Typegen,
  REST, GraphQL, HTTP, Hooks, Access, ACL, Roles, Validation, Password Auth,
  Soft Delete, PostgreSQL, vector, and testing behavior;
- concurrent requests and isolated workers with one initialized application
  owner per JavaScript realm;
- plugin identities, dependencies, peers, privileges, claims, capabilities,
  deterministic ordering, lifecycle, resources, and community extension SPIs;
- private-storage ownership, version/options/payload snapshots, references,
  transaction reuse, synchronization, orphan preservation, and all five record
  operations;
- direct and prepared PostgreSQL mutations, protected constraints, persistence
  rewrites, relation writes, atomic update expressions, logical result
  projection, and transaction ownership;
- complete source, type, package, PostgreSQL E2E, editor, performance, website,
  and coverage checks.

## Validation cost

The baseline complete gate exercised 2,590 ordinary tests and 2,837 coverage
tests. The final gate exercises 2,600 ordinary tests and 2,848 coverage tests:
ten and eleven additional regressions respectively, with unchanged coverage
projects, thresholds, and worker policy. The baseline did not record comparable
wall-clock phase timings. The final measured run records ordinary tests in
90.03 seconds, the package build in 35.94 seconds, complete coverage in 231.33
seconds, and website validation in 10.76 seconds.

## Remaining debt

The milestone does not claim that the codebase is debt-free. The complete lint
run still reports existing line-budget warnings, concentrated in large Core and
PostgreSQL implementation files and a smaller set of oversized tests. Those are
the clearest next behavior-preserving debt target, but extraction should be
driven by cohesive responsibilities rather than mechanical file splitting.

No capability, compatibility barrel, speculative registry, new package, or
future migration protocol was added to make this milestone possible.

## Final validation

- `yarn validate:full` passed formatting, type checking, lint, package builds,
  the ordinary suite, complete coverage, issue metadata, and website checks.
- Ordinary suite: 549 files and 2,600 tests.
- Complete coverage: 624 files and 2,848 tests; statements 90.91%
  (23,707/26,075), branches 84.49% (14,686/17,381), functions 96.07%
  (5,000/5,204), and lines 91.47% (22,995/25,137).
- Lint completed with no errors and 77 pre-existing line-budget warnings: 49
  in Core, 26 in other packages, and 2 in workspace tooling.
- Issue metadata passed 9 tests and website validation passed 66 tests.

# 3034: Run the final simplification and parity audit

- Status: completed
- Milestone: 30
- Packages: repository-wide
- Depends on: 3033
- ADR: decisions from issues 3002 and 3003 plus all retained foundational ADRs

## Goal

Prove from a clean checkout that the complete milestone materially simplified
Core and every official plugin without losing current behavior, capability,
stability, security, editor quality, transport parity, or documentation truth.

## Acceptance criteria

- [x] Re-run issue 3001's complete feature and capability inventory against
      source, examples, public exports, packed packages, generated contracts,
      and the public website.
- [x] Reconcile every stable contract-matrix ID against final source, public
      surfaces, regression evidence, website pages, and approved disposition;
      no entry may disappear or change status implicitly.
- [x] Every removed capability was explicitly approved and is absent from
      source, manifests, privileges, snapshots, exports, documentation,
      examples, generated projects, and tests.
- [x] Every baseline-to-final behavior difference maps to an exact removal
      explicitly approved in issue 3002 or 3003 or through a later architecture
      stop; any unmapped difference is a regression.
- [x] Direct TypeScript, JavaScript without Typegen, PostgreSQL, REST, GraphQL,
      Yoga, Hono, every official plugin, nested writes, virtual fields, and
      contextual relation filters retain their baseline outcomes.
- [x] Core dependency direction, product-neutral vocabulary, Master authority,
      monotonic policy, structural validation, transactions, cancellation,
      callback attribution, safe errors, and resource cleanup remain intact.
- [x] Compare production and test lines and files, Core and per-plugin shares,
      public exports, concepts, command representations, change fan-out,
      startup, heap, request cost, coverage, and local and hosted CI durations
      with issues 3001 and 3014.
- [x] Verify that the public website describes final behavior and contains no
      stale path, option, example, limitation, or ownership claim.
- [x] Explain any missed directional target through retained behavior or
      stability value; do not manipulate code, tests, or docs to hit a metric.
- [x] Archive the active plan and mark the milestone complete only after the
      final audit loop is green.

## Tests

- [x] From a clean commit, run `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn test:coverage`, `yarn lint`, `yarn format:check`, `yarn build`,
      package archives, website validation and browser tests, built E2E, and
      full PostgreSQL Testcontainers E2E.
- [x] Run source and packed public API, language-service, JavaScript, security,
      lifecycle, conformance, removal, documentation-source, and link audits.
- [x] Record hosted CI measurements only after a push is separately authorized.

## Audit gate

- [x] Perform the complete repository and public-website audit. If any finding
      exists, keep issue 3034 and the milestone open, correct it, rerun affected
      validation, and repeat the complete audit until no finding remains.
- [x] If parity cannot be restored without changing an accepted architecture
      decision or adding a new boundary, stop and apply the architecture stop
      protocol; do not close the milestone through a workaround.
- [x] Record exact final evidence and Documentation impact: both.

## Out of scope

- Resuming product work, the paused ACL objective, or additional Soft Delete
  work before this issue closes.

## Final audit and handoff

The [final report](../../docs/plans/2026-09-21-milestone-30-final-audit.md)
reconciles all 89 stable contract IDs, source/packed/JavaScript/editor behavior,
all 16 plugin audits, exact removals, complete website journeys and original /
3014 / final measurements. The detached checkout starts at `0e199514`, installs
its own dependencies from the immutable cache and receives only the final
formatting and documentation corrections before affected checks are repeated.
No dist or compiler cache is copied into the clean baseline.

The audit found one Prettier condition wrapping issue and stale roadmap/README
wording. The formatting repair removes three physical production lines and
preserves canonical emitted JavaScript. Focused GraphQL checks, rebuild and
complete built/website gates pass afterward. Initial setup and format failures
are retained separately from successful final gates; no test threshold, timeout,
retry, exclusion or assertion changes. A direct-workspace compiler resolution
failure did not reproduce through the documented root command, so no script or
dependency change was retained.

The final production total is 127,093 lines: -7,011 against the original baseline,
including -4,968 in Core. The post-checkpoint reduction is 790 lines, of which
three are formatting only. All 23 package public export-name sets match 3014.
The report records complete coverage-location reconciliation, canonical bundle
size, startup/heap samples, and the lack of new hosted CI evidence because no
push is authorized. Timing differences are not sold as performance or cognitive
complexity percentages.

Documentation impact: both. The public roadmap now records completion without
announcing a new implementation objective; engineering contracts, plans, issue
records and the final report preserve the audit. No new API, option, security
behavior or product feature is added or removed. No implementation exceeds the
final audit's acceptance criteria. After final formatting/backlog/diff checks,
commit this issue separately and stop. Preserve the user's editor change and
suspended Soft Delete stash; do not push or start a subsequent milestone.

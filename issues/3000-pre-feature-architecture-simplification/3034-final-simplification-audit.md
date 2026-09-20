# 3034: Run the final simplification and parity audit

- Status: planned
- Milestone: 30
- Packages: repository-wide
- Depends on: 3033
- ADR: decisions from issues 3002 and 3003 plus all retained foundational ADRs

## Goal

Prove from a clean checkout that the complete milestone materially simplified
Core and every official plugin without losing current behavior, capability,
stability, security, editor quality, transport parity, or documentation truth.

## Acceptance criteria

- [ ] Re-run issue 3001's complete feature and capability inventory against
      source, examples, public exports, packed packages, generated contracts,
      and the public website.
- [ ] Reconcile every stable contract-matrix ID against final source, public
      surfaces, regression evidence, website pages, and approved disposition;
      no entry may disappear or change status implicitly.
- [ ] Every removed capability was explicitly approved and is absent from
      source, manifests, privileges, snapshots, exports, documentation,
      examples, generated projects, and tests.
- [ ] Every baseline-to-final behavior difference maps to an exact removal
      explicitly approved in issue 3002 or 3003 or through a later architecture
      stop; any unmapped difference is a regression.
- [ ] Direct TypeScript, JavaScript without Typegen, PostgreSQL, REST, GraphQL,
      Yoga, Hono, every official plugin, nested writes, virtual fields, and
      contextual relation filters retain their baseline outcomes.
- [ ] Core dependency direction, product-neutral vocabulary, Master authority,
      monotonic policy, structural validation, transactions, cancellation,
      callback attribution, safe errors, and resource cleanup remain intact.
- [ ] Compare production and test lines and files, Core and per-plugin shares,
      public exports, concepts, command representations, change fan-out,
      startup, heap, request cost, coverage, and local and hosted CI durations
      with issues 3001 and 3014.
- [ ] Verify that the public website describes final behavior and contains no
      stale path, option, example, limitation, or ownership claim.
- [ ] Explain any missed directional target through retained behavior or
      stability value; do not manipulate code, tests, or docs to hit a metric.
- [ ] Archive the active plan and mark the milestone complete only after the
      final audit loop is green.

## Tests

- [ ] From a clean commit, run `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn test:coverage`, `yarn lint`, `yarn format:check`, `yarn build`,
      package archives, website validation and browser tests, built E2E, and
      full PostgreSQL Testcontainers E2E.
- [ ] Run source and packed public API, language-service, JavaScript, security,
      lifecycle, conformance, removal, documentation-source, and link audits.
- [ ] Record hosted CI measurements only after a push is separately authorized.

## Audit gate

- [ ] Perform the complete repository and public-website audit. If any finding
      exists, keep issue 3034 and the milestone open, correct it, rerun affected
      validation, and repeat the complete audit until no finding remains.
- [ ] If parity cannot be restored without changing an accepted architecture
      decision or adding a new boundary, stop and apply the architecture stop
      protocol; do not close the milestone through a workaround.
- [ ] Record exact final evidence and Documentation impact: both.

## Out of scope

- Resuming product work, the paused ACL objective, or additional Soft Delete
  work before this issue closes.

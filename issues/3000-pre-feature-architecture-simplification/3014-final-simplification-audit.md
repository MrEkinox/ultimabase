# 3014: Run the final simplification and parity audit

- Status: planned
- Milestone: 30
- Packages: repository-wide
- Depends on: 3013
- ADR: decisions from issues 3002 and 3003 plus all retained foundational ADRs

## Goal

Prove from a clean checkout that the milestone materially simplified UltimaBase
without losing current product behavior, retained plugin powers, stability,
security, editor quality, or transport parity.

## Acceptance criteria

- [ ] Re-run issue 3001's complete feature and plugin-power inventory against
      source, examples, public exports, packed packages, and generated contracts.
- [ ] Reconcile every stable contract-matrix ID against the final source,
      public surfaces, regression evidence, and approved disposition; no entry
      may disappear or change status implicitly.
- [ ] Every retained power has a production consumer or named mandatory
      invariant or supported public/community contract; every removed power was
      explicitly approved and is absent from source, manifests, privileges,
      snapshots, exports, documentation, examples, generated projects, and
      tests.
- [ ] Build a baseline-to-final behavior-difference ledger. Every difference
      maps to one exact removal explicitly approved in issue 3002 or 3003; any
      unmapped difference is a regression and keeps the milestone open.
- [ ] One active application per process, concurrent request isolation,
      sequential disposal and replacement, and parallel isolated workers pass
      their complete lifecycle and security matrix.
- [ ] Application operations and schema mutations have one canonical compiled
      representation and immutable developer, Typegen, REST, GraphQL, and
      execution projections.
- [ ] Direct TypeScript, JavaScript without Typegen, PostgreSQL, REST, GraphQL,
      Yoga, Hono, Password Auth, Access, Hooks, ACL, Roles, Validation, Soft
      Delete, nested writes, virtual fields, and contextual relation filters
      retain their baseline outcomes.
- [ ] Core dependency direction, product-neutral vocabulary, Master authority,
      monotonic policy, structural validation, transactions, cancellation,
      callback attribution, and safe errors remain intact.
- [ ] Compare production and test lines and files, Core share, public exports,
      command representations, representative change fan-out, startup, heap,
      request cost, and local and hosted CI durations with issue 3001.
- [ ] Explain any missed directional target through behavior or stability value;
      do not manipulate code or tests merely to hit a numerical target.
- [ ] Archive the active plan and mark the milestone complete only after the
      final audit loop is green.

## Tests

- [ ] From a clean commit, run `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn test:coverage`, `yarn lint`, `yarn format:check`, `yarn build`,
      package archives, website validation, browser tests, built E2E, and full
      PostgreSQL Testcontainers E2E.
- [ ] Run source and packed public API, language-service, JavaScript, security,
      lifecycle, conformance, and removal audits.
- [ ] Record hosted CI measurements only after a push is separately authorized.

## Audit gate

- [ ] Perform the complete repository audit. If any finding exists, keep issue
      3014 and the milestone open, correct it, rerun affected validation, and
      repeat the complete audit. Continue until no unresolved finding remains.
- [ ] If parity cannot be restored without changing an accepted architecture
      decision or adding a new boundary, stop and apply the architecture stop
      protocol; do not close the milestone through a workaround.
- [ ] Record exact final evidence and Documentation impact before completion.

## Out of scope

- Resuming product work, the paused ACL objective, or additional Soft Delete
  work before this issue closes.

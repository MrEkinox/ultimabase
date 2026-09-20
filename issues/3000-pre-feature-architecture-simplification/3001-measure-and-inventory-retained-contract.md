# 3001: Measure and inventory the retained contract

- Status: completed
- Milestone: 30
- Packages: repository-wide
- Depends on: none
- ADR: all accepted application, plugin, Runtime, transport, and Typegen ADRs

## Goal

Create a reproducible baseline of current product behavior, plugin powers,
public surface, code size, change fan-out, and validation cost before removing
or consolidating architecture.

## Acceptance criteria

- [x] Inventory every public plugin capability and classify it as currently
      consumed, publicly supported, required by an invariant, or a removal
      candidate. A test, README, or example alone does not prove a production
      consumer, but it records an implemented or promised contract and never
      justifies automatic removal.
- [x] Give every baseline behavior and capability a stable contract-matrix ID,
      owner, public surfaces, consumers or invariant, baseline evidence,
      retention or proposed-removal decision, and regression coverage. Every
      later issue must audit against this matrix.
- [x] Map each currently consumed or supported capability to its current
      official package, example, and Runtime consumer, including schema and field declarations, options,
      operations, schema mutations, policy, behavior, observers, transports,
      private storage, resources, and explicit plugin instances.
- [x] Record candidate removals without changing code, including generic
      decoration and replacement, compiler and Runtime replacement, Typegen
      contribution levels, query extensions, and command families.
- [x] For every removal candidate, prove the absence of production, official
      plugin, application, public export, community-plugin, documentation,
      example, generated-project, architecture, security, lifecycle, transport,
      JavaScript, TypeScript, and conformance dependencies. Ambiguous or missing
      evidence classifies the capability as retained pending user decision.
- [x] Snapshot public exports, packed declarations, Typegen output, JavaScript
      no-Typegen behavior, direct TypeScript, REST, GraphQL, PostgreSQL, Master,
      Access, Hooks, ACL, Roles, Validation, Password Auth, and Soft Delete.
- [x] Measure production and test lines and files, Core share, command
      representations, representative change fan-out, compilation, startup,
      heap, in-memory request cost, and local validation durations from one
      clean commit.
- [x] Record the hosted CI reference separately from local measurements and do
      not extrapolate parallel job durations as elapsed workflow time.
- [x] Change no Runtime behavior, public API, package export, or test threshold.
- [x] Produce an explicit proposed removal list and a behavior-difference ledger
      for user review in issues 3002 and 3003; issue 3001 authorizes no removal.

## Tests

- [x] Backlog metadata, documentation links, formatting, and `git diff --check`
      pass.
- [x] Baseline commands are repeatable and their environment and revision are
      recorded.

## Audit gate

- [x] Audit the inventory against production imports, public exports, examples,
      generated contracts, and packed consumers; correct omissions and repeat
      the audit until no power is unclassified and no retained behavior lacks a
      baseline proof.
- [x] Apply the architecture stop protocol when a consumer or public obligation
      cannot be resolved from evidence; do not downgrade ambiguity to `unused`.
- [x] Record the green audit and exactly one Documentation impact classification
      before completing the issue.

## Out of scope

- Removing an API, changing application concurrency, consolidating a registry,
  or beginning another milestone issue.

## Handoff

- Baseline: [architecture simplification baseline](../../docs/plans/2026-09-20-architecture-simplification-baseline.md)
- Preservation ledger: [architecture contract matrix](../../docs/plans/2026-09-20-architecture-contract-matrix.md)
- Source revision: `5806d87a879df0db8265579737c83111eb6030f9`
- Result: 12 observable-behavior rows, 23 plugin-power rows, all 39 named
  non-fixture capability protocols, seven retained removal candidates, and four
  decision-ledger rows have stable IDs.
- Removal decision: none. Missing external community-plugin census evidence is
  recorded as ambiguity, so every candidate remains retained for issue 3003.
- Runtime/public impact: none. Package source, Runtime behavior, public exports,
  generated contracts, test thresholds, and website product documentation are
  unchanged.
- Scope: measurement tooling, internal planning evidence, and the already
  requested hard stop after issue 3014. No implementation exceeds the issue
  acceptance criteria.

### Audit loop

The first complete audit found four issues: the two initial baseline documents
and measurement script needed formatting; the matrix did not name every
privilege literal; its example mapping was implicit; and the first memory
sample measured only Vitest resident-set size. The corrections added all 23
privilege names, an explicit example/documentation map, and the reproducible
20-sample V8 heap/startup/read/mutation measurement. The completion audit then
caught an unsupported `active` milestone status and restored the valid
`planned` value while retaining the checked issue progress. The final audit
matched all 39 production capability IDs and all 23 privilege names against the
matrix, found no unclassified power or unauthorized difference, and was green.

### Validation

- `yarn measure:simplification`: passed.
- `yarn measure:runtime-baseline`: passed, 20 samples.
- `yarn typecheck`: passed in 26.47 seconds.
- `yarn build`: passed in 37.29 seconds.
- `yarn test:performance`: 2 files and 3 tests passed; 14.22 seconds host wall
  time and 336,699,392-byte peak resident set.
- `yarn test`: 520 files and 2,515 tests passed in 90.16 seconds.
- `NODE_OPTIONS=--max-old-space-size=6144 yarn lint`: passed with the existing
  92 line-budget warnings and no errors.
- `yarn format:check`, `yarn check:issues`, focused tooling typecheck/ESLint,
  capability/privilege completeness checks, and `git diff --check`: passed.

Documentation impact: internal engineering documentation. The issue records
measurement and preservation evidence without changing public behavior,
configuration, exports, examples, errors, security semantics, or supported
integrations, so the public website remains accurate.

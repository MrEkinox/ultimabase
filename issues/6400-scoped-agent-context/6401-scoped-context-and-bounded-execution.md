# 6401: Scope agent context and bound investigations

- Status: completed
- Milestone: 64
- Packages: repository documentation, tooling tests and existing CI guard routing
- Depends on: 6207, 6316
- ADR: none; operational routing preserves accepted architecture

## Goal

Make active work and applicable contracts easy to recover without loading all
historical decisions, and prevent unbounded retries of rejected approaches.
The user approved the complete workflow cleanup on 2026-10-02.

## Working context

- Scope: root guide/plan, existing indexes, issue guide, domain instructions,
  documentation/backlog regressions and existing CI guard routing. No product code.
- Current contracts: [agent guide](../../AGENTS.md),
  [architecture index](../../docs/current-architecture.md),
  [canonical validation ADR](../../docs/adr/0275-canonical-repository-validation.md).
- Locked decisions: keep every security/capability invariant and full gate;
  preserve history and retained typing boundaries; no new platform or registry.
- Rejected approaches: bulk-reading all ADRs/issues; a second architecture
  catalog; another custom task runner; rewriting all 599 historical issues.
  Reopen only for a demonstrated gap that existing routes/checks cannot cover,
  with explicit user approval for an architecture expansion.
- Proof commands: `yarn vitest run --project unit tooling/documentation tooling/issues`,
  `yarn check:issues`, then correctly permissioned `yarn validate:full`.
- Baseline: clean `8177161f`, synchronized with origin/main. Root startup bundle
  (AGENTS, README, ARCHITECTURE, CURRENT_PLAN) was 1,760 lines/107,366 bytes.
- Exploration budget: two comparable failed variants or 30 minutes without
  verifiable progress; validation wait excluded.
- Next action: none; work is complete. Evaluate effectiveness on subsequent issues
  without treating this checkpoint as approval for new product work.

## Acceptance criteria

- [x] Root guidance is a compact router; applicable detailed rules remain mandatory.
- [x] Current plan is short; the complete previous log remains accessible as history.
- [x] Plan catalog no longer routes completed milestone 63 as active.
- [x] Architecture index routes relevant contracts, tests and retained typing limits.
- [x] New/resumed work has a reusable bounded Working context and stop protocol.
- [x] Regression tests detect stale active/completed plan metadata and broken routing.
- [x] Full validation passes without changed coverage, budgets, discovery or capabilities.
- [x] Complete diff audit, exact context/line comparison and documentation impact recorded.

## Out of scope

Runtime/API changes, dependency redesign, Typegen inference experiments, new
skills/MCP infrastructure, deleting history, automatic chat creation and pushes.

## Evidence

- Focused documentation/backlog tests: 4 files, 33 tests pass; focused ESLint
  passes with no warning/error.
- Archive comparison against HEAD restores the original heading/link bases and
  is byte-identical. Product, dependency, plugin and Runtime sections are
  preserved, except the stale constructor installation wording now points to
  the already accepted `UltimaBase.use(...plugins)` contract.
- Correctly permissioned `ULTIMABASE_COVERAGE_WORKERS=2 yarn validate:full`
  passes: 559 ordinary files/2,672 tests, 638 coverage files/2,936 tests,
  no type errors, 2 metadata files/22 tests, 17 website files/66 tests,
  formatting, lint, build, compiled export checks and constraints.
- Coverage matches the saved raw control in all 729 production files:
  identical statement/function/branch maps and zero covered-location changes.
  Statements 23,789/26,146 (90.98%), branches 14,693/17,384 (84.52%),
  functions 4,999/5,202 (96.09%), lines 23,065/25,192 (91.55%).
- The diff audit found that documentation-only CI selected only the active-prose
  guard, not the architecture index or new checkpoint guard. The existing runner
  now selects both guard directories once; no selection graph, job, product test
  discovery, budget or worker limit changes. The audit invalidates focused runner
  tests, formatting, tooling types and lint. Their complete post-correction
  revalidation passes: `yarn tsc --project tooling/tsconfig/test.json`,
  focused ESLint, `yarn vitest run --project unit tooling/ci tooling/documentation tooling/issues`
  (7 files/79 tests), and repository-wide `yarn format:check`.
  The full gate's ordinary/coverage totals preceded this one added runner test;
  the final runner's 9 tests all pass in the post-correction run. Unaffected
  product and covered-location evidence is not claimed to include that new test.

## Final audit

- Repository diff: +1,580/-867 lines across 19 files, including log relocation.
- Tests: +427/-1; internal CI: +4/-2. Core/plugins: +0/-0.
- Markdown: net +285 lines, including archived history and this issue handoff.
- Root guide: 366 -> 148 lines (22,165 -> 9,821 bytes).
- Current checkpoint: 503 -> 31 lines; old log is preserved, not deleted.
- Combined entry files: 869 -> 179 lines (79.4% fewer). Reading the whole
  index conservatively, the root startup bundle becomes 447 lines/43,879 bytes
  instead of 1,760 lines/107,366 bytes. Applicable domain/package contracts
  are additional targeted reads; these numbers are not measured token savings.
- Runtime, plugins, exports, generated declarations, dependency graph, coverage
  exclusions/thresholds, worker limits and performance budgets are unchanged.
  The only non-test TypeScript edit is the existing CI runner's two-line net
  increase to select the same guards on documentation-only changes.
- Final audit: no unresolved finding, no additional architecture decision.
  The CI route correction is necessary to make the approved consistency
  safeguards effective remotely; no independently valuable product work was added.
- Remaining limit: instructions and metadata checks cannot prove the semantic
  quality of an agent's investigation. Evaluate real elapsed work and repeated
  mistakes over subsequent issues; do not claim guaranteed accuracy or credit savings.
- Documentation impact: internal engineering documentation. No package/public
  behavior, configuration, installation, integration, example or security
  contract changed, so public website prose remains accurate and needs no edit.

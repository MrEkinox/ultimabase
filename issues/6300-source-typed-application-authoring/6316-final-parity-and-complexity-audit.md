# 6316: Audit parity, DX, complexity, and TypeScript cost

- Status: planned
- Milestone: 63
- Packages: complete repository
- Depends on: 6315
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Prove with exact old-versus-new evidence that source-typed authoring improves
developer experience and reduces implementation debt without losing an
UltimaBase capability or making TypeScript impractical.

## Acceptance criteria

- [ ] The ADR-0259 capability matrix and every capability added afterward are reconciled against the final implementation.
- [ ] The audit compares complete old and new application, schema, plugin-author, command, and local-exception examples.
- [ ] Production, Core, plugin, test, documentation, public export, dependency, package, declaration-byte, and changed-file deltas are reported exactly.
- [ ] Removed Typegen plugin projections, retained Typegen graph code, and new Core/plugin source-typing code are measured separately so a facade cannot hide net complexity.
- [ ] Typegen regeneration, complete edit-to-diagnostic latency, cold typecheck, language-service initialization, completion, hover, diagnostics, heap, Runtime startup, complete tests, and coverage are compared with raw samples and summarized distributions.
- [ ] Every locked issue-6301 budget passes; any exception requires explicit user approval and cannot be hidden by averaging unrelated fixtures.
- [ ] Total handwritten production lines are below 122,645, public exports are below 1,720, and aggregate package declaration bytes do not exceed 839,935.
- [ ] No second public or private Typegen replacement, duplicate plugin installation path, schema auto-registration, `Schema.use()`, or permanent application-handle bridge remains.
- [ ] Coverage percentages and counters do not regress without an explained unreachable-code removal that increases or preserves effective coverage.
- [ ] `yarn validate:full` passes and the complete results are recorded.
- [ ] The final report states what improved, what became worse, remaining debt, and whether the approved DX target was achieved honestly.
- [ ] The final report renders the complete final one-file developer form, with no temporary syntax, and compares every authoring concern with the saved canonical target.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Complete source and packed editor matrix.
- [ ] Complete JavaScript, TypeScript, plugin conformance, E2E, PostgreSQL, transport, security, performance, documentation, and coverage gates.
- [ ] Two final repeated TypeScript performance runs and two complete coverage runs where variance matters.
- [ ] `yarn validate:full` as the final milestone gate.

## Audit and commit gate

- [ ] Record the starting revision and verify issues 6301–6315 each have a complete iteration table, zero findings, passing required checks, one Documentation impact classification, and a reviewed dedicated commit.
- [ ] Audit the complete baseline-to-final milestone diff rather than summing issue claims; independently reconcile capabilities, deletions, old/new DX, TypeScript/Runtime costs, coverage locations, documentation, and every stop condition.
- [ ] Record each final finding and correction in the handoff; reopen the owning issue evidence when needed, rerun every invalidated check, and repeat the complete milestone audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, unavailable, incomparable, or over-budget required result prevents milestone completion; do not average it away, defer it, lower a threshold, or call CI green without evidence.
- [ ] Complete every acceptance/test checkbox, publish the exact final report, record exactly one Documentation impact classification, and pass `yarn validate:full` before marking the issue and milestone `completed`.
- [ ] Create one dedicated local commit only after the final audit is green; inspect its complete diff and exact line categories, amend/re-audit if needed, report the hash, and do not push without explicit confirmation.

## Out of scope

- Hiding a missed criterion in a future issue.
- Adding a new product feature to improve the comparison.
- Pushing the completed milestone without explicit user confirmation.

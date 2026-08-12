# 1421: Modularize schema declarations and enforce file budgets

- Status: planned
- Milestone: 14
- Packages: repository-wide, `@ultimabase/core`
- Depends on: 1419, 1420
- ADR: ADR-0187, ADR-0192

## Goal

Split the oversized schema declaration implementation along its existing
responsibility boundaries and prevent production or test files from growing
back into unreviewable monoliths.

## Accepted remediation scope

- The current public API, compiled graph, provenance, diagnostics, Runtime order,
  and package exports remain unchanged.
- Schema option definitions and resolution, patch operation factories,
  selectors, transformation application, provenance, Runtime option compilation,
  and registry orchestration move into focused internal modules.
- Tests move into matching focused suites rather than one replacement monolith.
- Lint and CI enforce explicit production and test line budgets. Generated files
  are excluded. Existing oversized handwritten files receive centralized,
  temporary non-growth budgets that can only decrease until removed.
- Repository contribution guidance records the limits and prohibits permanent
  local bypasses.

## Acceptance criteria

- [ ] No schema declaration production module exceeds 500 lines and focused test files stay within the accepted test budget.
- [ ] Production files warn before the hard limit, handwritten test files have a separate explicit hard limit, and generated artifacts are excluded by path rather than inline suppression.
- [ ] Every pre-existing oversized handwritten file is either brought under the limit or listed in one reviewed baseline that rejects line-count growth.
- [ ] `AGENTS.md` documents the budgets, exception ownership, and decreasing-baseline rule.
- [ ] The split introduces no public export, compatibility alias, dependency cycle, duplicated invariant, or behavior change.
- [ ] Source and packed package consumers observe identical public declarations before and after the split.

## Tests

- [ ] Existing schema declaration runtime, type, language-service, build, and packed-export suites pass unchanged except for file relocation.
- [ ] Focused tests prove the file-budget rule, generated-file exclusion, baseline non-growth behavior, and failure diagnostics.
- [ ] Repository constraints and lint pass with no local disable added for the new modules.

## Out of scope

- New schema behavior, compiler replacement, Typegen rendering, or plugin-kit helpers.
- Refactoring unrelated oversized domains in the same commit; their baseline
  entries become explicit future maintenance work.

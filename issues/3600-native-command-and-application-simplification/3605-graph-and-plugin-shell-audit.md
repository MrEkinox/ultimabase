# 3605: Audit graph planning and shared plugin shells

- Status: completed
- Milestone: 36
- Depends on: 3601

## Goal

Measure whether one-pass capability indexes and the common Access/Hooks
contribution shell can remove real repeated work. Implement only reductions
that preserve ordering, privilege, ownership, and product-specific semantics.

## Result

- Plugin graph construction now indexes providers once by exact capability
  token instead of scanning every provider and its declarations for every
  consumer requirement.
- The graph reuses its canonical plugin-ID nodes for lookup rather than building
  a second post-order index, and duplicate instance validation uses one pass.
- Configuration, dependency, optional dependency, peer, provider, conflict,
  cycle, and topological ordering semantics remain unchanged. The graph source
  moved from 431 to 398 lines and no longer triggers the production line-budget
  warning.
- The Access/Hooks shell was deliberately not abstracted. Its only shared shape
  is a short owner-attribution mapping; a cross-package helper plus public types,
  tests, and documentation would add more production code while coupling
  distinct policy and lifecycle semantics.
- Corrected the exact no-value plugin export annotations found by the full lint
  and typecheck loop without changing their public `void` contract.

Production changed by 61 additions and 94 deletions (`-33` lines). No test or
public documentation lines were required.

Validation:

- focused graph and capability composition suite (2 files, 25 tests)
- `yarn workspace @ultimabase/core test` (258 files, 1,330 tests)
- `yarn typecheck`
- `yarn lint` (no errors; 81 existing line-budget warnings)
- `yarn build`

Documentation impact: internal engineering documentation. The public plugin,
capability, Access, Hooks, ordering, diagnostics, and application contracts are
unchanged; this issue records both the implemented graph reduction and the
rejected shell abstraction.

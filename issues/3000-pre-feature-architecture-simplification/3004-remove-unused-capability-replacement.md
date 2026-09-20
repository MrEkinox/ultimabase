# 3004: Remove unused replacement and observer powers

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/testing`, plugin documentation
- Depends on: 3003
- ADR: ADR-0259

## Goal

Remove only the generic capability decoration and replacement machinery that
issue 3001 proves unused and the user explicitly approves in issue 3003,
including specialized compiler/Runtime replacement and the unused generic Core
observer path. The exact approved scope is R-001–R-004 and R-009 in ADR-0259.

## Acceptance criteria

- [ ] Move the current four Runtime cost scenarios to equivalent internal
      instrumentation of canonical assembly and stage calls before removing
      the public Testing probe and its five exports. Preserve database-work
      assertions without a public metrics API, production test switch, or
      cross-package private production import.
- [ ] Remove the generic Core observer token, `provideRuntimeObserver`,
      `postCommitEvent`, and their exclusive contracts/assembly. Retain
      `runtime:observe`, official Hooks/Access event and diagnostic capabilities,
      post-commit delivery, rollback suppression, and callback attribution.
- [ ] Remove selected replacement and decoration definitions, privileges,
      planning, lifecycle branches, public exports, inspection metadata,
      examples, documentation, conformance fixtures, and packed declarations.
- [ ] Change only symbols on issue 3003's explicitly approved removal list. If
      implementation reveals a new actual consumer, a public contract outside
      the approved removal, or a required invariant that cannot be preserved,
      stop and reopen the decision before deleting it. Existing self-tests or
      documentation of an approved unused API do not require approval again.
- [ ] The canonical schema compiler and Runtime executor become direct Core
      implementation boundaries without a dormant public replacement protocol.
- [ ] Preserve compiler integrity/provenance and Runtime authority/transaction
      checks even where old regression tests used a removed replacement seam.
- [ ] Retained single, multiple, and pipeline provider composition continues to
      support every current cross-plugin interaction and supported contract
      identified by issue 3001.
- [ ] Privilege policy and diagnostics reject removed names rather than silently
      accepting inert declarations.
- [ ] No compatibility alias, no-op replacement, private official bypass, or
      second capability graph remains.

## Tests

- [ ] Source, type, JavaScript, packed-export, manifest, privilege, capability,
      lifecycle, plugin conformance, and performance tests cover the smaller
      contract and absence of removed APIs.
- [ ] Relevant repository typecheck, unit tests, lint, build, constraints, and
      package archives pass.

## Audit gate

- [ ] Run a removal audit for every deleted symbol and protocol, then audit all
      retained providers for composition and lifecycle regressions. Fix every
      finding and repeat both audits until green.
- [ ] Record final line, file, export, test, and duration deltas plus
      Documentation impact before completion.

## Out of scope

- Removing retained contribution powers or implementing the canonical
  command graph.

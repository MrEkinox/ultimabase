# 3004: Remove unused capability replacement powers

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/testing`, plugin documentation
- Depends on: 3003
- ADR: decision from issue 3003

## Goal

Remove generic capability decoration and replacement machinery that issue 3001
proves has no production consumer, including specialized compiler or Runtime
replacement paths selected by the accepted decision.

## Acceptance criteria

- [ ] Remove selected replacement and decoration definitions, privileges,
      planning, lifecycle branches, public exports, inspection metadata,
      examples, documentation, conformance fixtures, and packed declarations.
- [ ] The canonical schema compiler and Runtime executor become direct Core
      implementation boundaries without a dormant public replacement protocol.
- [ ] Retained single, multiple, and pipeline provider composition continues to
      support every production-used cross-plugin interaction identified by issue 3001.
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

- Removing production-used contribution powers or implementing the canonical
  command graph.

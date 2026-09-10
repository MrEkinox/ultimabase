# 2604: Extend official Access for plugin-owned schema mutations

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2603
- ADR: ADR-0245, once accepted

## Goal

Let the optional official Access engine authorize each declared schema mutation
under its own generated operation key without making Core depend on Access.

## Acceptance criteria

- [ ] The compiled mutation surface augments exact schema Access options and
      plugin defaults with typed operation keys such as `softDelete` only for
      schemas that declare them.
- [ ] An explicit mutation policy is independent from native update and delete
      policy; neither can silently grant the other.
- [ ] Initial operation, item, target-filter, value-dependent, and final output
      restrictions run at the accepted Runtime boundaries and compose by denial
      or logical AND.
- [ ] Omitted operation declarations follow one documented fail-closed default
      rule without changing the existing built-in defaults.
- [ ] Compatible official providers may narrow a custom mutation through the
      public contribution capability, exact owner attribution, and ordinary
      peer compatibility.
- [ ] Trusted Master bypasses the complete official Access policy while Core
      validation, protected integrity constraints, Hooks, transactions, and
      persistence remain active.
- [ ] Omitting `accessPlugin()` installs no policy stage and does not prevent a
      structurally valid plugin mutation from executing.
- [ ] Typegen, autocomplete, hover documentation, JavaScript validation, and
      packed exports agree on the application-specific operation vocabulary.

## Tests

- [ ] Policy matrices cover allow, deny, omitted defaults, item filters,
      compatible providers, no engine, Master, two applications, and coexistence
      with native update and delete rules.
- [ ] Compile-time tests prove exact keys and reject unknown or stale mutation
      declarations.

## Out of scope

- Making the soft-delete plugin depend on or install the official Access engine.

# 3011: Derive developer and Typegen surfaces

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, official command-owning plugins
- Depends on: 3010
- ADR: decision from issue 3003

## Goal

Derive schema classes, application handles, model handles, JavaScript lookup,
and Typegen declarations from the canonical command graph rather than parallel
surface registries.

## Acceptance criteria

- [ ] One surface projection derives command presence, target, authority,
      payload, selection, inclusion, and result types for every retained direct
      TypeScript entry point.
- [ ] Static class execution follows the single-active-application contract;
      application and model handles remain thin immutable views rather than
      owners of separate command metadata.
- [ ] Generic Typegen derives operation and schema-command declarations from the
      same graph used by JavaScript Runtime execution.
- [ ] Source and packed autocomplete, hovers, required fields, negative cases,
      application-specific commands, and no-Typegen JavaScript retain current
      behavior.
- [ ] No command owner repeats a Typegen surface declaration that the graph can
      derive, and no generated artifact becomes Runtime truth.
- [ ] Superseded surface registries and generators are removed in the same
      change whenever their final consumer migrates.

## Tests

- [ ] Core, Typegen, Password Auth, Soft Delete, source editor, packed editor,
      JavaScript, first-generation, stale-output, fingerprint, and performance
      suites pass.
- [ ] Public export, typecheck, lint, build, constraints, `attw`, and `publint`
      checks pass where affected.

## Audit gate

- [ ] Audit every direct command surface against the canonical graph and search
      for duplicated declarations, generated Runtime state, lost inference, and
      stale registries. Correct and repeat until green.
- [ ] Record editor, build, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- REST or GraphQL transport projection and new generated client behavior.

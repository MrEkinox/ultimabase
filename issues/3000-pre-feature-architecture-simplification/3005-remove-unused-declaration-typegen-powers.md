# 3005: Remove unused declaration and Typegen powers

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, official plugins
- Depends on: 3004
- ADR: ADR-0259

## Goal

Remove only declaration, query, command, and Typegen extension levels proven
unused by issue 3001 and explicitly approved in issue 3003, while preserving
graph-derived Typegen and every retained plugin surface. The exact approved
scope is R-005–R-008 and R-010 in ADR-0259.

## Acceptance criteria

- [ ] Remove destructive schema field/index/constraint/option patches and the
      replacement variants of option setters, including `schema:transform`.
      Retain additive patches, selectors, options, ownership/provenance checks,
      and duplicate/conflict rejection; never introduce last-writer-wins.
- [ ] Remove arbitrary schema/model plugin-operation targets, generic
      `schemaCommands`/`modelCommands`, and their handle/Typegen projections.
      Retain application operations, Password Auth factory methods, native
      model CRUD, and actual schema mutations on schema/model handles.
- [ ] Remove exactly the unused powers selected by issue 3003, including their
      privileges, registrars, IR nodes, snapshot data, generators, public
      exports, examples, documentation, and tests.
- [ ] If implementation reveals a new actual consumer or retained editor,
      JavaScript, security, or lifecycle behavior that cannot be preserved,
      stop and reopen the decision before deleting it. Existing self-tests or
      documentation of an approved unused API do not require approval again.
- [ ] Retain graph-derived schema, field, option, operation, schema-mutation,
      model, and transport typing used by current applications.
- [ ] Retain only manual public type-reference or declaration facts with a
      proven production consumer and no graph-derived equivalent.
- [ ] JavaScript applications continue to execute the same Runtime graph without
      Typegen or generated JavaScript.
- [ ] Removing one power cannot leave a private registry, inert metadata branch,
      stale privilege, compatibility alias, or undocumented deep import.

## Tests

- [ ] Source and packed language-service tests prove retained autocomplete,
      hovers, strict negative cases, first generation, stale replacement, and
      no-Typegen JavaScript behavior.
- [ ] Public export, manifest, fingerprint, deterministic generation,
      typecheck, lint, build, constraints, and relevant E2E pass.

## Audit gate

- [ ] Audit the final graph and generated declarations for both missing retained
      types and surviving unused extension paths. Correct and repeat the complete
      audit until green.
- [ ] Record final line, file, export, test, and duration deltas plus
      Documentation impact before completion.

## Out of scope

- Redesigning TypeScript syntax or adding a new Typegen extension mechanism.

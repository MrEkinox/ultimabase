# 408: Align packages and documentation with native Access

- Status: done
- Milestone: 4
- Packages: repository documentation and workspace metadata
- Depends on: 419, 421
- ADR: supersede the affected parts of ADR-0006 and ADR-0116

## Goal

Remove the unimplemented CLP and field-permission package layers now that
native schema and field Access provide their complete behavior with a smaller
public API.

## Acceptance criteria

- [x] A new ADR records that native `schema.access` is UltimaBase's generalized CLP and native `field.access` is its field-permission system.
- [x] The accepted ADR preserves ACL as a persisted per-object Access provider and roles/authentication as optional context providers rather than permission engines.
- [x] `@ultimabase/clp-permissions-plugin` and `@ultimabase/field-permissions-plugin` are removed from workspace metadata, package maps, constraints, release configuration, and placeholder documentation.
- [x] Core, Runtime, package, roadmap, architecture, and transport documentation use the unified Access terminology without rewriting historical ADR decisions.
- [x] Parse-style CLP syntax is explicitly deferred to a future compatibility or preset package and is not part of the first-release architecture.
- [x] No runtime behavior, schema metadata, migration output, or inferred model type changes.

## Tests

- [x] Workspace constraints, typecheck, lint, tests, build, package archive validation, and stale-reference searches pass after package removal.

ADR-0120 owns the consolidated terminology. The complete repository suite
passes with 1,701 tests, and the packed-package suite validates the reduced
workspace surface without either placeholder archive.

## Out of scope

- Roles, ACL storage, authentication, or new Access runtime behavior.

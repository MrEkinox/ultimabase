# 730: Create the standard fields package

- Status: planned
- Milestone: 7+
- Packages: standard-fields
- Depends on: 729
- ADR: none

## Goal

Create `@ultimabase/standard-fields` as the official plugin package for portable
derived fields backed by native UltimaBase field kinds.

## Acceptance criteria

- [ ] The package registers derived-field validation handlers through the global plugin graph.
- [ ] `validator` is integrated through focused imports for supported string formats.
- [ ] UltimaBase owns stable public option types instead of exposing dependency-specific options.
- [ ] Validation dependencies remain outside `@ultimabase/core`, Core, and Runtime.
- [ ] Nested plugin configuration and public exports follow repository conventions.
- [ ] The package README documents validation versus normalization behavior.

## Tests

- [ ] Runtime tests prove shared validation dispatch and dependency boundaries.
- [ ] Package archive tests validate ESM exports and declarations.

## Out of scope

- Phone-number metadata, which is introduced by issue 732.
- Individual field factories tracked by follow-up issues.

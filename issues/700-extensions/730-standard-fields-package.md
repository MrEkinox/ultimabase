# 730: Create the standard fields package

- Status: superseded
- Milestone: 7+
- Packages: future `@ultimabase/standard-fields-plugin`
- Depends on: 729
- ADR: none
- Superseded by: 2007

Issue 2007 supersedes this unimplemented package. Applications use native fields
with their selected Standard Schema validators, and reusable validators can be
ordinary community packages without installing an UltimaBase Runtime plugin.
No empty or compatibility package is created. The original proposal remains
below as historical context.

## Goal

Create `@ultimabase/standard-fields-plugin` as the official plugin package for portable
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

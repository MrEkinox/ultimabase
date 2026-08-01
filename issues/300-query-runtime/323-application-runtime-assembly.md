# 323: Assemble the application Runtime engine

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 211, 311, 312, 318, 319, 320
- ADR: ADR-0064, ADR-0065

## Goal

Create a typed `FrameworkEngine` from one initialized application and its
plugin-provided database adapter without requiring developers to construct the
mandatory Runtime pipeline manually.

## Acceptance criteria

- [ ] A public factory preserves the application's exact schema and plugin tuples.
- [ ] Assembly resolves exactly one `DatabaseAdapter` through `databaseAdapterServiceToken`.
- [ ] Schema validation and application hook/event stages are installed automatically.
- [ ] Normalization, commit, CLP, ACL, and field-permission positions receive explicit neutral stages when no owning plugin is installed.
- [ ] Installed pipeline contributions retain dependency-first plugin ordering.
- [ ] Master authority remains optional and uses the existing trusted boundary.
- [ ] Missing adapters, conflicting stage owners, invalid contributions, and unusable application states fail before the first operation.

## Tests

- [ ] A public-API test executes a bound Query through an assembled fake adapter.
- [ ] Neutral access stages produce an explicit empty constraint list.
- [ ] Hooks, structural validation, exact schema inference, and invalid assembly are covered.

## Out of scope

- PostgreSQL connection and SQL compilation belong to milestone 5.
- Permission decisions remain owned by their independent access plugins.

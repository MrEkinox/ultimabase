# ADR-0035: Schema domain-oriented internal layout

- Status: accepted
- Date: 2026-07-31

## Decision

`@ultimabase/schema` organizes implementation files by domain instead of keeping
all source and test files at the package root. The internal domains are fields,
schema composition, validation plans, inference, extensions, and shared runtime
guards. Field code is further separated into base contracts, built-in fields,
and declaration-time constraints.

The package root `index.ts` remains the only public manifest and continues to
list exports explicitly. Internal folders do not expose barrel files, package
subpaths, or aliases. Relative imports must follow the domain dependency
direction documented by the package README.

Tests mirror the major domains but continue to exercise public behavior through
the root source entry whenever an internal import is not specifically required.

## Consequences

Maintainers can locate one responsibility without scanning an expanding flat
directory. File movement and future internal refactors remain invisible to
consumers because ADR-0016 already prohibits deep package imports.

The layout introduces a small amount of relative path depth. Avoiding internal
barrels and aliases keeps module resolution, declaration builds, and package
maintenance explicit.

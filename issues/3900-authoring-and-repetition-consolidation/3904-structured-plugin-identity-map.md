# 3904: Consolidate structured plugin identity maps

- Status: completed
- Milestone: 39
- Depends on: 3903

## Problem

Core separately implements the same nested `pluginId` then `instanceId` map for
capability readers, setup contexts, owner-local contribution IDs, and private
storage contribution IDs. Each copy must preserve the structured identity rule
from ADR-0190 and repeats lookup, allocation, and insertion mechanics.

## Scope

- add one private Core collection for values keyed by `PluginIdentity`;
- use it in the four existing application-local stores;
- keep every public facade, diagnostic, ownership check, and lifecycle boundary
  unchanged;
- retain exact distinction between an absent instance ID and every explicit
  instance ID.

## Acceptance criteria

- [x] Capability readers and setup contexts remain stable for the same exact
      identity and distinct for separate instances.
- [x] Owner-local setup and private-storage contribution IDs keep their current
      duplicate rules.
- [x] No serialized identity key or public registry API is introduced.
- [x] The consolidation removes more production code than it adds.
- [x] Relevant Core tests, typecheck, lint, and build pass.

## Outcome

One private `PluginIdentityMap` now owns the nested structured-identity storage
mechanic shared by capability readers, setup contexts, setup contribution IDs,
and private-storage contribution IDs. The four consumers retain their existing
values and diagnostics without serializing or concatenating user-controlled
identity segments.

The TypeScript production diff is 75 additions and 98 deletions, a net removal
of 23 lines. Six focused test lines additionally protect the distinction between
the default plugin identity and one explicit instance.

## Validation

- focused Core tests: 4 files and 9 tests passed, with no type errors;
- `yarn workspace @ultimabase/core typecheck` passed;
- `yarn typecheck` passed;
- `yarn test` passed outside the restricted network sandbox: 536 files and
  2,554 tests, with no type errors;
- `yarn lint` passed with only the repository's existing line-budget warnings;
- `yarn build` passed, including package export validation;
- `yarn check:issues` passed: 1 file and 9 tests;
- `git diff --check` passed.

## Documentation impact

Internal engineering documentation. This issue and `CURRENT_PLAN.md` record the
consolidation and its evidence. No public API, configuration, behavior, error,
or supported integration changed, so package and website documentation remain
accurate without a public edit.

# 3402: Prove representative plugin migrations

- Status: completed
- Milestone: 34
- Depends on: 3401
- ADR: ADR-0270

## Goal

Migrate a minimal fixture, Soft Delete, and Password Auth to prove the new form
across static schema/model declarations, protected Runtime providers, private
storage, application exports, operations, transports, and lifecycle work.

## Acceptance criteria

- [x] The three representatives use only `plugin()` plus contributions.
- [x] Their public options and exact configured-plugin types remain intact.
- [x] Focused Runtime, Typegen, transport, lifecycle, and E2E behavior remains
      equivalent.
- [x] Before/after authoring steps and lines are recorded.

## Authoring audit

The baseline is commit `1e2485c4`, immediately before the representative
migrations. Counts include complete source files, including comments and
whitespace.

| Representative                | Before | After | Change |
| ----------------------------- | -----: | ----: | -----: |
| Soft Delete `src/plugin.ts`   |    243 |   213 |    -30 |
| Password Auth `src/plugin.ts` |    326 |   306 |    -20 |
| Combined production authoring |    569 |   519 |    -50 |

Soft Delete no longer declares a module object, capability tuple, definition
shape, long module-instance type, separate capability list, separate operation
list, or `declare` phase. Password Auth additionally removes separate `setup`
and `hooks` buckets. Their author-visible phase wiring falls from four and six
top-level authoring buckets respectively to `contributions` plus `permissions`.
Real manifest facts such as Password Auth's environment claim and optional HTTP
peer remain explicit.

The minimal Core fixture proves a zero-privilege application resource with one
`plugin()` call and one contribution. Soft Delete proves schema options,
patches, model surfaces, constraints, persistence rewrites, mutations,
bindings, and Typegen. Password Auth proves private storage, required
capabilities, application exports, optional HTTP integration, lifecycle work,
and a callback-local Master privilege.

## Handoff

- Documentation impact: internal engineering documentation. The two package
  factories preserve their public options, exports, and behavior; the public
  contribution-first authoring contract was already documented by issue 3401.
- Validation: focused ESLint; Core typecheck and all 263 Core test files (1,336
  tests); Soft Delete typecheck, all 6 package test files (19 tests), build, and
  its non-database E2E; Password Auth typecheck, all 15 package test files (64
  tests), build, and both non-database E2E files. PostgreSQL E2E was attempted
  but the host had no working container runtime; the repository-wide audit will
  retry it.
- No product capability or option changed. Existing manifest assertions prove
  identical identity, privilege order and reasons, capability inventory, and
  environmental claims.

# 5301: Normalize Runtime field-input roots

- Status: completed
- Milestone: 53
- Package: `@ultimabase/core`
- Depends on: 4801
- ADR: ADR-0101, ADR-0164, ADR-0245

## Goal

Normalize operation-specific mutation roots once before Core's canonical field
input traversal, removing repeated collector setup without changing any public
or Runtime behavior.

## Acceptance criteria

- [x] One private normalization step describes every supported create and update root.
- [x] One shared loop dispatches normalized roots to the existing field collectors.
- [x] Singular, bulk, upsert, and plugin schema mutation paths retain exact modes,
      item indexes, paths, and deterministic ordering.
- [x] Read and delete operations continue to expose no mutation field inputs.
- [x] No public export, capability, stage, callback, or behavior changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing field traversal, update-expression decoding, or transformation semantics.
- Changing operation ASTs, plugin schema mutations, Hooks, or Access behavior.
- Generalizing the private root descriptor into a public authoring API.

## Documentation impact

Internal engineering documentation. The milestone, issue, invariants, and line
audit are recorded here and in `CURRENT_PLAN.md`. No package README, public
website page, schema example, or ADR changes because public exports, field
visitor behavior, Runtime stages, operation semantics, and plugin authoring
contracts remain unchanged.

## Outcome

Native and plugin schema mutation operations now normalize their wrapper paths
to one private discriminated root sequence. A shared loop delegates create
roots to the existing field-map collector and update roots to the existing
update-expression collector. Recursive collection also carries item identity,
logical kind, mode, order, and output through one context instead of repeating
five parameters at every call.

Create-many and upsert-many preserve item order, upserts preserve create before
update, plugin mutations preserve their logical kind and effect path, and read
or delete operations still yield no mutation input. Focused regression coverage
now asserts every singular and set-based root beside the existing bulk, nested,
transformation, and plugin mutation coverage.

## Quantitative audit

Production TypeScript adds 135 lines and removes 185, a net reduction of 50.
`field-values.ts` falls from 585 to 535 lines. Tests add 80 lines and remove one,
a net addition of 79, to cover the previously implicit singular, set-based,
non-mutation, and plugin-delete cases. No public or generated file changes.

## Validation

- `yarn workspace @ultimabase/core test`: 266 files, 1,354 tests
- `yarn workspace @ultimabase/hooks-plugin test`: 20 files, 83 tests
- `yarn workspace @ultimabase/access-plugin test`: 12 files, 37 tests
- `yarn workspace @ultimabase/validation-plugin test`: 8 files, 41 tests
- `yarn workspace @ultimabase/acl-permissions-plugin test`: 16 files, 80 tests
- `yarn typecheck`
- `yarn test`: 545 files, 2,582 tests, no type errors
- `yarn lint`: 0 errors; 50 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting

The first sandboxed repository test run failed only because listener tests
received `EPERM` on `127.0.0.1`; the exact suite passed outside the sandbox.

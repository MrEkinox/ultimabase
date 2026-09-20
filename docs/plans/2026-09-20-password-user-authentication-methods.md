# Password User authentication methods

User-requested scope: expose `AppUser.signUp()`, `login()`, `refresh()`, and
`logout()` with the existing explicit or active application convention.
ADR-0254 records the approved API and implementation boundary.

## Acceptance

- [x] Attach four immutable methods to custom and default Password User classes.
- [x] Delegate through the canonical application operation handles.
- [x] Validate exact User and application ownership before credential work.
- [x] Keep explicit session tokens, required readable profiles, and existing results.
- [x] Verify session lifecycle, isolation, rollback, typing, and editor behavior.
- [x] Update and validate affected public and engineering documentation.
- [x] Complete focused and broader checks and create a dedicated local commit.

Documentation impact: both.

The Password Auth README and website teach the new class methods while retaining
operation tokens for transport configuration and `runWithSession()` for scoped
application work. Core documentation describes its contextual facade accessor.

## Scope audit

The only supporting public API beyond the four methods is Core's
`getCurrentUltimaBase()`. Existing contextual helpers expose the application and
request engine but not the facade owning executable application operation
handles. This accessor supplies that missing link without adding authentication
knowledge or a second operation executor. Soft Delete uses the existing
schema-mutation dispatcher and does not require this change. No Core schema
behavior changes; its schema examples remain accurate.

The operation tokens, operation handlers, and session-scope helper retain their
documented uses; this is an additive convenience API, not a replacement requiring
legacy code removal. The pre-existing change to `apps/website/next-env.d.ts` is
unrelated and remains outside this work.

## Validation

- Complete TypeScript rebuild: `yarn tsc --build tsconfig.json tooling/tsconfig/test.json --force` passed.
- `yarn build` passed, including declaration and package publication checks.
- `yarn test` exercised 518 files and 2,486 tests with no type errors. The initial
  run had the new public export in the wrong sorted position and sandbox-denied
  browser/socket tests. After correcting the export list, all four affected
  files passed outside the sandbox (17 tests); the other 514 files passed in the
  complete run.
- Compiled Password Auth E2E: 8 files, 27 tests passed, including PostgreSQL,
  REST, GraphQL, and editor behavior against bundled declarations.
- Website documentation validation: 17 files, 66 tests passed.
- Dependency constraints passed.
- Repository lint checked Core, packages, and workspace. Core and other packages
  retain 90 existing file-size warnings. Package lint needed
  `NODE_OPTIONS=--max-old-space-size=8192`; its two findings in the new files were
  fixed, and the final complete Password Auth lint passed with no warnings or
  errors. Workspace lint passed.
- Final focused source/type checks: 20 files, 75 tests passed, no type errors.
- Final Password Auth rebuild and publication checks passed. The new compiled
  class-method and editor suites passed again: 2 files, 6 tests.

Validation commands that rewrite package output were completed before the final
compiled tests. Earlier overlapping incremental TypeScript/build artifacts
caused transient missing-module/type errors; the forced rebuild and final
compiled E2E run resolved them without production workarounds.

# 1604: Audit and trim optional-product public surfaces

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/access-plugin`
- Depends on: 1509
- ADR: ADR-0189, ADR-0202, ADR-0204

## Goal

Keep only deliberate, documented Hooks and Access exports needed by application
developers or compatible plugin authors before the first stable release.

## Acceptance criteria

- [x] Every Hooks and Access barrel export is classified as application API, compatible-extension contract, conformance support, or internal implementation.
- [x] Unused helpers such as `createAccessContext` are removed unless a current public consumer and documented contract prove their value.
- [x] Raw option definitions, normalization helpers, and owner-attributed internal contribution types are no longer public unless compatible plugin authoring requires them.
- [x] Capability tokens and contribution factories required by community-compatible providers remain public and documented.
- [x] Importing either package remains inert and neither product gains a second contracts package.
- [x] Public API removal is atomic across implementations, barrels, tests, examples, and documentation with no compatibility aliases.

## Tests

- [x] Source and packed language-service tests prove the supported public imports.
- [x] Negative export tests prove removed internal names are unavailable without permitting deep imports.
- [x] Existing alternative Hooks and Access engines still compile through public contracts only.

## Completion evidence

- Both root barrels now use explicit exports grouped as application API,
  compatible-extension contract, or conformance support. One shared exhaustive
  classification drives source and packed language-service tests, so a future
  accidental export changes the verified surface.
- Raw option descriptor values, normalization functions, normalized Hook
  declaration types, and `OwnedHookContribution` or
  `OwnedAccessContribution` are absent from the roots. The unused
  `createAccessContext` implementation is deleted rather than retained behind
  an alias.
- Official contribution and event capability tokens, provider factories,
  target helpers, typed callback contracts, and diagnostics remain public and
  are documented in both package READMEs. Package imports stay side-effect-free
  and no contracts package was added.
- Focused source tests, packed declarations, package deep-import protection,
  independent alternative engine suites, and the complete repository gates
  pass without changing Hooks or Access Runtime behavior.

## Commands passed

- `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn constraints`, and
  `yarn build` including attw and publint.
- `yarn test`: 339 files and 1,851 unit/type tests.
- `yarn test:pack`: 15 files and 76 packed-consumption tests.
- `yarn test:e2e`: 43 files and 173 built public-export and PostgreSQL tests.

## Out of scope

- Changing Hooks ordering, transactions, or lifecycle behavior.
- Changing Access decisions, monotonicity, or Master semantics.
- Preserving pre-release accidental exports solely for compatibility.

# 1902: Add option-presence schema selection

- Status: ready
- Milestone: 19
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`
- Depends on: 1901
- ADR: ADR-0213

## Goal

Let an installed plugin select schemas carrying one direct option, including an
opaque callback-bearing value, and reuse ordinary owner-attributed patches for
structural contributions.

## Acceptance criteria

- [ ] `schemas.select({ option: { name } })` selects exact normalized option occurrences without reading or comparing their values.
- [ ] Existing `{ option: { name, path?, equals } }` structural JSON equality remains unchanged and the two forms are unambiguous in TypeScript and Runtime validation.
- [ ] Option definitions and values resolve before selector results freeze, while ADR-0192's plugin and patch ordering remains unchanged.
- [ ] Unknown, ambiguous, forged, missing-owner, and malformed selectors fail before setup or infrastructure effects.
- [ ] Opaque callbacks remain private nominal artifacts and never enter selector metadata, public compiler IR, Typegen, or fingerprints.
- [ ] Compiler IR and `schemaCompilerCapability` advance atomically to 3.0.0 for the new selector, reject protocol 2, and retain current extension nodes only until issues 1903 through 1906 complete the ordered migration.
- [ ] A community fixture selects one direct option and adds an ordinary field and index through existing patch factories with exact provenance and application isolation.
- [ ] No option-owned structural callback, contribution bag, or alternate patch API is introduced.
- [ ] Public APIs include focused English JSDoc and source plus packed language-service coverage.

## Tests

- [ ] Runtime and type tests cover presence and equality selection, opaque values, ordering, conflicts, immutability, compiler replacement, protocol-2 rejection, and application isolation.
- [ ] Typegen, JavaScript, Typegen-free, conformance, packed-package, and schema-compiler replacement tests cover the selected ordinary field patch.
- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Migrating ACL, PostgreSQL, or Roles.
- Nested-path presence or arbitrary executable selectors.
- Replacing plugin fields or general schema patches.

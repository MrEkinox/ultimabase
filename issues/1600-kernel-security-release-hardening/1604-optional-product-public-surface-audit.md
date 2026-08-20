# 1604: Audit and trim optional-product public surfaces

- Status: ready
- Milestone: 16
- Packages: `@ultimabase/hooks-plugin`, `@ultimabase/access-plugin`
- Depends on: 1509
- ADR: ADR-0189, ADR-0202, ADR-0204

## Goal

Keep only deliberate, documented Hooks and Access exports needed by application
developers or compatible plugin authors before the first stable release.

## Acceptance criteria

- [ ] Every Hooks and Access barrel export is classified as application API, compatible-extension contract, conformance support, or internal implementation.
- [ ] Unused helpers such as `createAccessContext` are removed unless a current public consumer and documented contract prove their value.
- [ ] Raw option definitions, normalization helpers, and owner-attributed internal contribution types are no longer public unless compatible plugin authoring requires them.
- [ ] Capability tokens and contribution factories required by community-compatible providers remain public and documented.
- [ ] Importing either package remains inert and neither product gains a second contracts package.
- [ ] Public API removal is atomic across implementations, barrels, tests, examples, and documentation with no compatibility aliases.

## Tests

- [ ] Source and packed language-service tests prove the supported public imports.
- [ ] Negative export tests prove removed internal names are unavailable without permitting deep imports.
- [ ] Existing alternative Hooks and Access engines still compile through public contracts only.

## Out of scope

- Changing Hooks ordering, transactions, or lifecycle behavior.
- Changing Access decisions, monotonicity, or Master semantics.
- Preserving pre-release accidental exports solely for compatibility.

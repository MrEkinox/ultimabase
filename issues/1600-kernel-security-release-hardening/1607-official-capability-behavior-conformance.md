# 1607: Strengthen official capability conformance

- Status: completed
- Milestone: 16
- Packages: `@ultimabase/testing`, `@ultimabase/hooks-plugin`, `@ultimabase/access-plugin`
- Depends on: 1605, 1606
- ADR: ADR-0193, ADR-0202, ADR-0204

## Goal

Extend official Hooks and Access conformance beyond manifest and Typegen checks
with public, behavior-oriented proofs useful to compatible community authors.

## Acceptance criteria

- [x] Official Hooks conformance verifies deterministic ordering, immutable inputs, transaction rollback, post-commit delivery, cleanup, and application isolation.
- [x] Official Access conformance verifies deny behavior, row filtering, item and field narrowing, relations, mutation transitions, Master modes, and monotonic composition.
- [x] Generic reusable checks live in `@ultimabase/testing` only when they remain product-neutral and add no dependency on a concrete plugin.
- [x] Official-protocol-specific fixtures remain owned by their product tests or public product contract without creating a dependency cycle or test-only production export.
- [x] Compatible-provider examples can run the relevant public conformance checks without deep imports.
- [x] Independent alternative engines are not required to implement the official Hooks or Access vocabulary.

## Tests

- [x] Source and packed conformance suites execute the behavior checks against official plugins.
- [x] At least one compatible community-style provider intentionally fails each major contract category with an actionable diagnostic.
- [x] Multiple explicit instances and application isolation remain covered.

## Completion evidence

- The official Hooks `middleware` check runs through only public package exports
  and proves field/provider/developer ordering, frozen callback values,
  transaction rollback, post-commit event delivery, automatic conformance
  cleanup, and isolation between fresh applications.
- The official Access `persistence` check proves capability-specific read
  denial, adapter-visible row filters, output and input field narrowing,
  prepared-item denial, a value-aware `replace` transition, relation denial,
  both Master modes, and monotonic composition across two explicit instances of
  one compatible provider plugin.
- Malformed community-style Hooks and Access providers fail the generic
  `capability-contracts` check with the exact provider identity and retained,
  actionable target diagnostic. The fixtures use package roots and stay under
  `tests/e2e/fixtures`; no test-only production export or concrete-product
  dependency was added to `@ultimabase/testing`.
- The Hooks, Access, and testing READMEs show how compatible providers attach
  their product-owned optional check to the generic runner. Independent engines
  continue to run the common kernel suite and their own vocabulary-specific
  checks.

## Commands passed

- `yarn typecheck`.
- Source conformance: 1 file and 7 tests through the `coverage-e2e` project.
- Built public exports: 1 file and 7 tests through the `e2e` project.
- `yarn test`: 343 files and 1,865 runtime/type tests.
- `yarn test:pack:built`: 16 files and 82 packed-consumption tests.
- `yarn lint` with zero errors; existing centralized file-size warnings remain.
- `yarn format:check`, `yarn constraints`, and `yarn build`, including attw and
  publint.

## Out of scope

- Defining one universal Hooks or policy-engine protocol.
- Making `@ultimabase/testing` depend on Hooks or Access implementations.
- Publishing the fixture alternative engines as product packages.

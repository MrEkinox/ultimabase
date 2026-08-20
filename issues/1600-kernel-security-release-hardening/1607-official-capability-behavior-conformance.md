# 1607: Strengthen official capability conformance

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/testing`, `@ultimabase/hooks-plugin`, `@ultimabase/access-plugin`
- Depends on: 1605, 1606
- ADR: ADR-0193, ADR-0202, ADR-0204

## Goal

Extend official Hooks and Access conformance beyond manifest and Typegen checks
with public, behavior-oriented proofs useful to compatible community authors.

## Acceptance criteria

- [ ] Official Hooks conformance verifies deterministic ordering, immutable inputs, transaction rollback, post-commit delivery, cleanup, and application isolation.
- [ ] Official Access conformance verifies deny behavior, row filtering, item and field narrowing, relations, mutation transitions, Master modes, and monotonic composition.
- [ ] Generic reusable checks live in `@ultimabase/testing` only when they remain product-neutral and add no dependency on a concrete plugin.
- [ ] Official-protocol-specific fixtures remain owned by their product tests or public product contract without creating a dependency cycle or test-only production export.
- [ ] Compatible-provider examples can run the relevant public conformance checks without deep imports.
- [ ] Independent alternative engines are not required to implement the official Hooks or Access vocabulary.

## Tests

- [ ] Source and packed conformance suites execute the behavior checks against official plugins.
- [ ] At least one compatible community-style provider intentionally fails each major contract category with an actionable diagnostic.
- [ ] Multiple explicit instances and application isolation remain covered.

## Out of scope

- Defining one universal Hooks or policy-engine protocol.
- Making `@ultimabase/testing` depend on Hooks or Access implementations.
- Publishing the fixture alternative engines as product packages.

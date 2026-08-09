# 804: Add the Nexus-style FieldBuilder

- Status: planned
- Milestone: 8
- Packages: `@ultimabase/core`
- Depends on: 803
- ADR: issue 802 ADR

## Goal

Expose the canonical `fields(field) { field.string('name') }` declaration DX
while reusing the existing immutable field factories and validation contracts.

## Acceptance criteria

- [ ] Core provides `string`, `boolean`, `int`, `bigint`, `float`, `decimal`, `uuid`, `date`, `dateTime`, `time`, `binary`, `json`, `enum`, `object`, `pointer`, and `relation` builder methods.
- [ ] Every method takes the logical field name first and the existing documented options second.
- [ ] Builder methods delegate to the existing factories rather than duplicating normalization, validation, hooks, Access, defaults, or inference rules.
- [ ] Nested `field.object()` declarations receive a path-aware nested builder and retain the embedded-object capability restrictions.
- [ ] Pointer and relation callbacks retain exact lazy schema identities and stay top-level-only where currently required.
- [ ] Duplicate names, reserved names, invalid names, malformed callbacks, and caller-owned mutation fail or snapshot exactly once at the declaration boundary.
- [ ] Reusable low-level field definitions have one explicit plugin-author composition path, but `field.custom()` is not documented as normal application DX.
- [ ] `Schema.defineWithStatics`, `Schema.defineWithCapabilities`, and package-owned schema specializations can consume the same declaration contract.

## Tests

- [ ] Runtime and compile-time tests cover every built-in method, immutability, nested paths, unsupported embedded fields, pointers, relations, and specializations.
- [ ] Language-service tests verify method, name, and option documentation from source and packed exports.

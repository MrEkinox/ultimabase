# 804: Add the Nexus-style FieldBuilder

- Status: completed
- Milestone: 8
- Packages: `@ultimabase/core`
- Depends on: 803
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Expose the canonical `fields(field) { field.string('name') }` declaration DX
while reusing the existing immutable field factories and validation contracts.

## Acceptance criteria

- [x] Core provides `string`, `boolean`, `int`, `bigint`, `float`, `decimal`, `uuid`, `date`, `dateTime`, `time`, `binary`, `json`, `enum`, `object`, `pointer`, and `relation` builder methods.
- [x] Every method takes the logical field name first and the existing documented options second.
- [x] Builder methods delegate to the existing factories rather than duplicating normalization, validation, hooks, Access, defaults, or inference rules.
- [x] Nested `field.object()` declarations receive a path-aware nested builder and retain the embedded-object capability restrictions.
- [x] Pointer and relation callbacks retain exact lazy schema identities and stay top-level-only where currently required.
- [x] Duplicate names, reserved names, invalid names, malformed callbacks, and caller-owned mutation fail or snapshot exactly once at the declaration boundary.
- [x] Reusable low-level field definitions have one explicit plugin-author composition path, but `field.custom()` is not documented as normal application DX.
- [x] `Schema.defineWithStatics`, `Schema.defineWithCapabilities`, and package-owned schema specializations can consume the same declaration contract.

## Tests

- [x] Runtime and compile-time tests cover every built-in method, immutability, nested paths, unsupported embedded fields, pointers, relations, and specializations.
- [x] Language-service tests verify method, name, and option documentation from source and packed exports.

## Evidence

Core now exposes one immutable name-first `FieldBuilder` backed by the existing
field factories, plus a restricted path-aware embedded builder and the explicit
low-level `field.add()` composition method. Runtime and type tests cover all
built-ins, exact relationship options, specializations, invalid declarations,
snapshotting, and embedded restrictions. Source and packed language-service
tests preserve documented completions, option help, and name-parameter help.
Repository-wide unit/type tests, typecheck, lint, formatting, constraints, and
build pass; the focused packed-package FieldBuilder E2E test also passes.

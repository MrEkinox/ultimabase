# 729: Define derived field contracts

- Status: ready
- Milestone: 7+
- Packages: schema, core
- Depends on: 125, 207, 210
- ADR: required

## Goal

Define how a plugin-owned logical field extends a native field while retaining
its own identity throughout setup, validation, generation, and adapter planning.

## Acceptance criteria

- [ ] `defineDerivedField` preserves a namespaced logical kind and an immutable native base field.
- [ ] Common options such as defaults, lists, indexes, descriptions, and permissions have deterministic inheritance rules.
- [ ] Validation plans retain the logical field and expose its native base plan without losing plugin metadata.
- [ ] GraphQL and database adapters can lower a claimed derived field to its native base representation.
- [ ] Application setup rejects unclaimed kinds, duplicate handlers, invalid native bases, and derivation cycles.
- [ ] The public contract does not depend on a validation library or concrete adapter.

## Tests

- [ ] Runtime tests cover option inheritance, immutability, handler claims, and setup failures.
- [ ] Compile-time tests cover native value inference, lists, defaults, and exact plugin metadata.

## Out of scope

- Concrete standard fields and their third-party validators.

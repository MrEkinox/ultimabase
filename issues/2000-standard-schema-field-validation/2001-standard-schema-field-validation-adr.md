# 2001: Decide the Standard Schema field-validation boundary

- Status: ready
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/postgres-plugin`, official plugins
- Depends on: none
- ADR: new ADR refining ADR-0166 and ADR-0211

## Goal

Define the exact replacement for Core's nested presence and field-constraint
objects before changing public field factories or Runtime validation.

## Acceptance criteria

- [ ] The ADR inventories every public validation option, normalizer, validation-plan node, Runtime execution boundary, issue code, adapter reader, Typegen consumer, example, and package export affected by the replacement.
- [ ] `required` becomes direct inspectable field metadata and remains the sole authority for create-time presence and derived nullability.
- [ ] Decimal `precision` and `scale` become direct inspectable field-shape metadata because PostgreSQL compiles them into `numeric(p, s)`; every other former constraint is classified explicitly.
- [ ] `validation` accepts one Standard Schema V1 validator for the complete canonical non-null field value, including complete list and object values.
- [ ] Core snapshots field kinds and structured values before validation; missing and null handling, defaults, generators, enum domains, pointers, relationships, and storage metadata remain Core contracts.
- [ ] Validation must complete synchronously, return no issues, and produce a value semantically equal to its input. Promise-like results and transformations fail with focused diagnostics.
- [ ] Standard Schema issue paths are prefixed with the Runtime field path and mapped to one stable transport-neutral UltimaBase issue code without depending on vendor-specific properties.
- [ ] Validators are documented as pure constraints that may run during initial validation, post-resolution structural revalidation, mutation-outcome validation, and result snapshotting without an exact-once guarantee.
- [ ] Built-in and plugin-defined fields share the same contract, while field-kind factories retain ownership of canonical value snapshots and their own structural configuration.
- [ ] `@ultimabase/core` directly depends on the types-only `@standard-schema/spec`; it does not import `@ultimabase/plugin-kit`, re-export a concrete validator, or add another package.
- [ ] The ADR defines exact input/output assignability, opaque validator retention, application isolation, Typegen omission, fingerprint behavior, errors thrown by malformed validators, and removal sequencing.
- [ ] No compatibility syntax, validation-object adapter, deprecated overload, or parallel custom-callback API is permitted.

## Tests

- [ ] The ADR names the required Runtime, type, language-service, Typegen, JavaScript, packed-package, PostgreSQL, plugin-field, and multi-validator conformance coverage for issues 2002 through 2006.
- [ ] `yarn check:issues` and `yarn format:check` pass.

## Out of scope

- Implementing the accepted contract.
- Selecting a concrete validation library.
- Async database uniqueness, authorization, or input transformation.

# 2001: Decide the Standard Schema field-validation boundary

- Status: completed
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/postgres-plugin`, official plugins
- Depends on: none
- ADR: ADR-0219

## Goal

Define the exact replacement for Core's nested presence and field-constraint
objects before changing public field factories or Runtime validation.

## Acceptance criteria

- [x] The ADR inventories every public validation option, normalizer, validation-plan node, Runtime execution boundary, issue code, adapter reader, Typegen consumer, example, and package export affected by the replacement.
- [x] `required` becomes direct inspectable field metadata and remains the sole authority for create-time presence and derived nullability.
- [x] Decimal `precision` and `scale` become direct inspectable field-shape metadata because PostgreSQL compiles them into `numeric(p, s)`; every other former constraint is classified explicitly.
- [x] `validation` accepts one Standard Schema V1 validator for the complete canonical non-null field value, including complete list and object values.
- [x] Core snapshots field kinds and structured values before validation; missing and null handling, defaults, generators, enum domains, pointers, relationships, and storage metadata remain Core contracts.
- [x] Validation must complete synchronously, return no issues, and produce a value semantically equal to its input. Promise-like results and transformations fail with focused diagnostics.
- [x] Standard Schema issue paths are prefixed with the Runtime field path and mapped to one stable transport-neutral UltimaBase issue code without depending on vendor-specific properties.
- [x] Validators are documented as pure constraints that may run during initial validation, post-resolution structural revalidation, mutation-outcome validation, and result snapshotting without an exact-once guarantee.
- [x] Built-in and plugin-defined fields share the same contract, while field-kind factories retain ownership of canonical value snapshots and their own structural configuration.
- [x] `@ultimabase/core` directly depends on the types-only `@standard-schema/spec`; it does not import `@ultimabase/plugin-kit`, re-export a concrete validator, or add another package.
- [x] The ADR defines exact input/output assignability, opaque validator retention, application isolation, Typegen omission, fingerprint behavior, errors thrown by malformed validators, and removal sequencing.
- [x] No compatibility syntax, validation-object adapter, deprecated overload, or parallel custom-callback API is permitted.

## Tests

- [x] The ADR names the required Runtime, type, language-service, Typegen, JavaScript, packed-package, PostgreSQL, plugin-field, and multi-validator conformance coverage for issues 2002 through 2006.
- [x] `yarn check:issues` and `yarn format:check` pass.

## Decision evidence

- ADR-0219 separates direct presence, direct decimal shape, canonical Core
  snapshots, and application validation into distinct authorities.
- One synchronous Standard Schema validator receives the complete canonical
  non-null value. Lists and objects validate as complete values after their
  structural and child boundaries succeed.
- Standard failures map to `field.validation`; malformed, asynchronous,
  throwing, or transforming validators fail as internal contract violations.
- Opaque validators remain nominal application-local artifacts and are omitted
  from Typegen declarations and fingerprints without becoming Runtime truth.
- The migration removes the old DSL, plugin `normalizeValidation`, aliases,
  issue codes, exports, examples, and documentation without compatibility.

## Out of scope

- Implementing the accepted contract.
- Selecting a concrete validation library.
- Async database uniqueness, authorization, or input transformation.

# 3901: Unify plugin field-family authoring

- Status: completed
- Milestone: 39
- Depends on: none

## Goal

Replace Core's separate type-only and contextual builder declarations with one
field-family definition that owns shared Typegen metadata and optional
per-context builder implementations.

## Acceptance criteria

- [x] One Core factory supports plugin fields with or without a public builder.
- [x] Builder contexts inherit shared kind and Typegen metadata while retaining
      exact per-context overrides.
- [x] The declaration registry exposes one authoring operation and keeps the
      existing Runtime and Typegen inspection outputs.
- [x] ACL and pg-vector use the canonical Core form without Plugin Kit aliases.
- [x] Source and compiled public API tests preserve inference and hover names.
- [x] Package and repository validation pass.
- [x] Production lines decrease and documentation impact is recorded.

## Outcome

Core now exposes `definePluginFieldFamily()` and `fields.register()` as the
single field-family authoring path. A family carries its namespaced field kind,
Typegen metadata, and optional contextual builder implementations. Contexts can
override both kind and Typegen metadata, so the consolidation removes duplicate
registration concepts without narrowing the previous contract.

The old field-type module and Plugin Kit alias were removed. ACL and pg-vector
now declare their field families directly against Core, while Runtime and
Typegen continue to consume the same normalized declaration outputs.

The complete issue diff contains 1,161 added and 1,159 deleted lines, for a net
increase of 2 lines after tests, ADRs, documentation, and tracking are counted.
Handwritten production TypeScript decreases by 88 lines: 408 added and 496
deleted. Tests decrease by 89 lines (494 added and 583 deleted) while replacing
the two former API suites with coverage of the unified contract.

## Validation

- Core, Plugin Kit, ACL, pg-vector, GraphQL, and Typegen package tests passed.
- Source type tests and the compiled pg-vector language-service tests passed.
- The open-kernel end-to-end fixture passed.
- `yarn typecheck`, `yarn test`, `yarn lint`, and `yarn build` passed.
- `yarn website:validate` passed.
- `yarn test:coverage` passed with 90.55% statements, 83.98% branches,
  95.75% functions, and 91.16% lines.

## Documentation impact

Classification: **both**.

ADR-0273 records the canonical authoring contract and supersedes ADR-0214.
Core and Plugin Kit package documentation, the Core schema example, and the
public plugin schema and Typegen guide now use the field-family form.

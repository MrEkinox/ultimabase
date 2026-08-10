# Paused plan: generated schema authoring and type contracts

- Status: paused
- Started: 2026-08-09
- Paused: 2026-08-10
- Resume point: [issue 810](../../../issues/800-generated-types/810-generated-schema-dx-verification.md)
- Governing decisions: ADR-0173, ADR-0175, ADR-0176, ADR-0177, ADR-0179

The implementation phases through issue 811 are complete except for the final
DX and performance verification owned by issue 810. The generated registry is
already the source of precise application typing, repository schemas use the
map-returning FieldBuilder, and relationship targets use generated schema names.

Resume only after the mutation relationship projection milestone is complete or
after explicit user direction. The milestone execution order remains documented
in [`issues/800-generated-types/README.md`](../../../issues/800-generated-types/README.md).

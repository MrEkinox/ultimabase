# ADR-0289: Remove kernel extension points without a consumer

- Status: accepted
- Date: 2026-10-08
- Refines: ADR-0102, ADR-0128, ADR-0193, ADR-0264; applies ADR-0288 step 1
- Approval: user validated on 2026-10-08

## Evidence

Imports were collected with the TypeScript parser over every tracked file
outside `packages/core` (production sources, tests, examples and website code
fences). The following public values are imported by no production source of
any other package:

| Export                                                                                     | Imported outside Core by |
| ------------------------------------------------------------------------------------------ | ------------------------ |
| `restrictInput`, `restrictSelection`, `restrictOutput`, `constraint`, `databaseConstraint` | tests only (or nothing)  |
| `beforeOperation`, `afterOperation` (Core interceptor factories)                           | one test each            |
| `runtimeInterceptorCapability`, `runtimeConstraintCapability`                              | nothing                  |
| `defineSchemaConstraint`                                                                   | one test                 |
| `contributeSchemaMutationBinding`                                                          | nothing                  |
| `pluginEnvironmentClaims`, `pluginEnvironmentClaimMetadata`, `pluginPrivilegeMetadata`     | nothing                  |

The Hooks plugin's own `beforeOperation`/`afterOperation` hook options are a
different, used contract and are not affected. `guard`, `preparedOperation`,
`provideRuntimeInterceptor` (ACL) and `provideRuntimeConstraint` (Access, ACL,
Soft Delete) are used and stay.

## Decision

Remove the listed exports, the adapter bridges below, their type
vocabularies and every Core mechanism that exists only to serve them. The
same rule applies to any other public contract this work finds that only
tests consume. A mechanism that a kept contract uses
internally (for example a primitive that `protectedPolicy` compiles to) stays
internal instead of public. Tests that only exercise a removed export are
deleted with it; tests of kept behavior are migrated to the kept contract
without losing an assertion. Public documentation stops mentioning the
removed names.

## Adapter bridges

The PostgreSQL plugin provides raw-access and physical-schema contribution
bridges (`postgresRawAdapterCapability`,
`postgresPhysicalSchemaContributionCapability`) built on Core's adapter
support protocols (`defineAdapterRawCapability`,
`defineAdapterContributionCapability`, `provideAdapterContribution`,
`provideAdapterCapability`, `adapterSupport` and the `adapter*Capability`
tokens). Only tests consume them and no plugin requests the `adapter:raw`
privilege. The user decided to remove every contract that only tests use,
including these bridges and the `adapter:raw` privilege; a future community
need reopens them with a real consumer and a new ADR.

## Preserved boundaries

Monotonic narrowing, per-contribution Master bypass, the Runtime order and
the used enforcement, interceptor and constraint contracts are unchanged.

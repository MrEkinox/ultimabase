# 1420: Align capability phases and declaration contracts

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/roles-plugin`
- Depends on: 1419
- ADR: ADR-0190, ADR-0191, ADR-0195

## Goal

Make capability typing, phase-specific reads, Runtime option compilation, and
legacy migration documentation describe one executable contract.

## Accepted remediation scope

- Declaration-lifetime provider and replacement values are constrained to
  immutable JSON-compatible facts in TypeScript as well as at the JavaScript
  boundary.
- Application factories retain provider-first `materialization` reads. Plugin
  setup retains both materialization requirements and explicit peer `setup`
  requirements after every application capability has materialized.
- Schema option Runtime compilers run before plugin setup and therefore accept
  only `materialization` requirements. They do not reuse an unrestricted setup
  reader.
- A later `postMaterialization` phase requires a concrete consumer and a separate
  architectural decision; this remediation does not anticipate it.
- Public documentation and hover text describe capability-based role resolution
  and current framework errors instead of removed neutral services.

## Acceptance criteria

- [x] TypeScript rejects non-serializable declaration provider and replacement values that Runtime would reject.
- [x] JavaScript validation still rejects forged, mutable, or non-JSON declaration values and snapshots accepted values immutably.
- [x] Application factories cannot read setup-phase requirements, Runtime option compilers cannot declare or read them, and plugin setup may read exact declared setup-phase requirements.
- [x] Mutual setup-only peer composition remains supported without creating a factory or plugin-graph cycle.
- [x] Default materialization requirements retain provider-first factory and lifecycle ordering.
- [x] Roles documentation and `hasRole` hover text name `accessRoleResolverCapability` and `PLUGIN_CAPABILITY_MISSING`; removed service terminology is absent from current package documentation.
- [x] Diagnostics scheduled for later operation and adapter issues are not claimed as shipped early.

## Tests

- [x] Type tests cover declaration JSON values and phase-specific Runtime option requirements through source and packed exports.
- [x] Runtime tests cover factory, compiler, setup, mutual-peer, missing-provider, and disposal behavior without adding another lifecycle phase.
- [x] Repository searches protect the removal of stale public neutral-service documentation.

## Out of scope

- A third capability requirement phase.
- Cyclic application resource construction or lifecycle-order inference.
- Plugin operation and adapter diagnostics owned by issues 1416 and 1417.

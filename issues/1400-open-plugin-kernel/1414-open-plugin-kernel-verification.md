# 1414: Verify the trusted open plugin kernel

- Status: completed
- Milestone: 14
- Packages: repository-wide
- Depends on: 1413
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0194

## Goal

Audit the delivered public kernel, toolbox, Typegen, Runtime, adapters, and proof
plugins before milestone 15 extracts official product systems.

## Acceptance criteria

- [x] Every milestone 14 issue and dependency is complete with no superseded implementation or undocumented compatibility path remaining.
- [x] String slots, public plugin service registries, generic contribution registries, and unprivileged legacy facades are removed or proven private Core resource storage.
- [x] Public exports, privileges, capabilities, static phases, schema provenance, Typegen, Runtime middleware, persistence rewrites, codecs, and inspection match the accepted ADRs.
- [x] JavaScript uses the real Runtime without Typegen and TypeScript uses inert declarations without a generated client.
- [x] Plugin-kit contains only proven reusable helpers and official consumers use them where applicable.
- [x] Conformance fixtures prove workflow, value codec, soft delete, privilege denial, packed consumption, and application isolation.
- [x] Security review confirms master non-forgeability, protected monotonic constraints, transport non-exposure by default, and no privilege inheritance.
- [x] Compatibility review records plugin and capability version selection, explicit instances, upgrades, stable diagnostic codes, and the supported deprecation boundary.
- [x] Architecture, package READMEs, schema examples, Typegen docs, issue status, and roadmap describe one current contract and milestone 15 resume point.

## Tests

- [x] Repository unit/type tests, coverage, typecheck, lint, formatting, constraints, build, package archives, and complete PostgreSQL E2E pass.
- [x] Public API and dependency audits find no deep import, `any`, private official-plugin path, stale generated artifact, or undocumented output.

## Out of scope

- Implementing Hooks or Access extraction; milestone 15 begins only after this gate.
- Sandbox, marketplace, hot reload, or privilege lockfile work.

## Verification record

- The public dependency graph contains no Core import of a concrete plugin,
  infrastructure package, `plugin-kit`, or future Hooks/Access contract package.
  Package exports expose only root entry points, and official plugins consume
  public package APIs without deep imports or production `any`.
- Searches for the removed `slot`, service-token, service-registry, and generic
  contribution-registry surfaces found only removal tests, historical wording,
  and Core's private `PluginSetupRegistries` resource store. That class is not a
  package export, and plugin setup contexts have explicit negative tests for a
  general `registries` property.
- JavaScript proof fixtures execute dynamic schemas, operations, persistence,
  and inspection through the real Runtime without Typegen. TypeScript and packed
  tests consume inert declarations only; executable Typegen output remains
  rejected. The Todo example fingerprint was regenerated against snapshot v4.
- The conformance snapshot now directly covers application, schema, and model
  operations, schema/model commands, Query extensions, an explicit plugin
  instance, and a structured Typegen contribution through public APIs.
- Security tests cover opaque and foreign Master grants, anonymous-only public
  transport contexts, explicit transport allowlists, cumulative protected
  constraints after transforms, and owner-scoped nested plugin privileges.

## Compatibility boundary

- Plugin compatibility uses the manifest's canonical package version and Core
  SemVer range. Capability protocols select the exact compatible token version
  independently; incompatible majors fail before effects and inspection reports
  the selected version and replacement chain.
- Repeated plugin configuration requires distinct explicit instance IDs.
  Dependencies, privileges, provenance, setup exports, and contributions retain
  the complete structured identity.
- Persisted contribution changes require explicit versioned migration intent.
  Missing upgrades fail closed, and removed contributions remain inert orphans
  until a migration owner makes an explicit non-automatic decision.
- Kernel failures retain the stable ADR-0191 framework codes. Community domain
  failures remain namespaced `PluginError` values with transport-safe payloads.
- This pre-release boundary preserves no alias for removed slots, services,
  registries, or superseded public APIs. Native Hooks and Access remain the
  explicitly documented temporary compatibility implementation until milestone
  15 removes them through issue 1508.

## Commands passed

- `yarn constraints`, `yarn format:check`, `yarn typecheck`, `yarn lint`, and
  `yarn build` (including attw and publint for every package).
- `yarn test`: 352 files and 2,025 tests, including TypeScript type tests.
- `yarn test:coverage`: 88.00% statements and 88.20% lines.
- `yarn test:pack`: 11 files and 56 packed-consumption tests.
- `yarn test:e2e`: 36 files and 143 complete PostgreSQL/Testcontainers tests.

Milestone 15 resumes at issue 1501; this audit deliberately performs no Hooks
or Access extraction.

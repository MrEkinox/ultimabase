# 1414: Verify the trusted open plugin kernel

- Status: planned
- Milestone: 14
- Packages: repository-wide
- Depends on: 1413
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0194

## Goal

Audit the delivered public kernel, toolbox, Typegen, Runtime, adapters, and proof
plugins before milestone 15 extracts official product systems.

## Acceptance criteria

- [ ] Every milestone 14 issue and dependency is complete with no superseded implementation or undocumented compatibility path remaining.
- [ ] String slots, public plugin service registries, generic contribution registries, and unprivileged legacy facades are removed or proven private Core resource storage.
- [ ] Public exports, privileges, capabilities, static phases, schema provenance, Typegen, Runtime middleware, persistence rewrites, codecs, and inspection match the accepted ADRs.
- [ ] JavaScript uses the real Runtime without Typegen and TypeScript uses inert declarations without a generated client.
- [ ] Plugin-kit contains only proven reusable helpers and official consumers use them where applicable.
- [ ] Conformance fixtures prove workflow, value codec, soft delete, privilege denial, packed consumption, and application isolation.
- [ ] Security review confirms master non-forgeability, protected monotonic constraints, transport non-exposure by default, and no privilege inheritance.
- [ ] Compatibility review records plugin and capability version selection, explicit instances, upgrades, stable diagnostic codes, and the supported deprecation boundary.
- [ ] Architecture, package READMEs, schema examples, Typegen docs, issue status, and roadmap describe one current contract and milestone 15 resume point.

## Tests

- [ ] Repository unit/type tests, coverage, typecheck, lint, formatting, constraints, build, package archives, and complete PostgreSQL E2E pass.
- [ ] Public API and dependency audits find no deep import, `any`, private official-plugin path, stale generated artifact, or undocumented output.

## Out of scope

- Implementing Hooks or Access extraction; milestone 15 begins only after this gate.
- Sandbox, marketplace, hot reload, or privilege lockfile work.

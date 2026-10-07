# 1507: Prove no-Access, alternative-Access, and Core Master

- Status: completed
- Milestone: 15
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 1506
- ADR: ADR-0071, ADR-0128, ADR-0189, ADR-0194, ADR-0204

## Goal

Prove Access is optional, a community engine can enforce a different model, and
Core master authority remains non-forgeable in every configuration.

## Acceptance criteria

- [x] One TypeScript and one JavaScript application execute CRUD without access-plugin, Access options, plans, providers, or placeholder enforcement.
- [x] Starting a public transport without a compatible policy engine emits `UNPROTECTED_PUBLIC_TRANSPORT`; explicit transport acknowledgement silences this supported-mode warning.
- [x] A minimal alternative policy engine contributes a different policy DX, protected row and field enforcement, Typegen, and diagnostics through public APIs.
- [x] The independent alternative owns its protocol identity and does not import access-plugin.
- [x] Installing official and alternative engines together either composes through disjoint public claims or fails deterministically on the concrete namespace, capability, or enforcement claim they both own; Core adds no universal engine conflict.
- [x] Core Master works with no Access, official Access, and alternative Access; no transport, provider, Runtime replacement, or persistence rewrite can forge or inherit it.
- [x] ACL enforces the same persisted policy with no Access engine and composes monotonically with official Access or the independent alternative without importing either.

## Tests

- [x] Conformance, language-service, Runtime, packed, PostgreSQL, warning, denial, master-audit, and application-isolation suites cover the complete matrix.

## Implementation evidence

- `alternative-policy-engine.e2e.test.ts` proves a tenant-centric community DX,
  row and field restrictions, diagnostics, Typegen, conformance, application
  isolation, official-engine coexistence, ACL composition, and audited Master
  across no-Access, official Access, and alternative-engine applications.
- `alternative-policy-engine.postgres.e2e.test.ts` enforces the alternative
  policy against PostgreSQL and proves anonymous restriction plus explicit
  audited Master bypass without importing the official Access package.
- `optional-hooks-engines.postgres.e2e.test.ts` and its JavaScript fixture run
  complete CRUD and transaction paths with PostgreSQL as the only configured
  plugin, so the same applications contain neither Hooks nor Access behavior.
- Core transport tests prove the structured warning, one-warning-per-protocol
  behavior, explicit acknowledgement, anonymous-only wire authority, and
  rejection of transported Master contexts. Existing Runtime replacement,
  persistence rewrite, protected-provider, and Master grant tests cover the
  remaining non-inheritance and anti-forgery boundaries.
- The packed archive and language-service suites verify the acknowledgement and
  alternative declarations through built public package exports.

## Out of scope

- Publishing the alternative engine.
- Moving master or master-key configuration out of Core.

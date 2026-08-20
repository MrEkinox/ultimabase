# 1507: Prove no-Access, alternative-Access, and Core Master

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 1506
- ADR: ADR-0071, ADR-0128, ADR-0189, ADR-0194, ADR-0204

## Goal

Prove Access is optional, a community engine can enforce a different model, and
Core master authority remains non-forgeable in every configuration.

## Acceptance criteria

- [ ] One TypeScript and one JavaScript application execute CRUD without access-plugin, Access options, plans, providers, or placeholder enforcement.
- [ ] Starting a public transport without a compatible policy engine emits `UNPROTECTED_PUBLIC_TRANSPORT`; explicit transport acknowledgement silences this supported-mode warning.
- [ ] A minimal alternative policy engine contributes a different policy DX, protected row and field enforcement, Typegen, and diagnostics through public APIs.
- [ ] The independent alternative owns its protocol identity and does not import access-plugin.
- [ ] Installing official and alternative engines together either composes through disjoint public claims or fails deterministically on the concrete namespace, capability, or enforcement claim they both own; Core adds no universal engine conflict.
- [ ] Core Master works with no Access, official Access, and alternative Access; no transport, provider, Runtime replacement, or persistence rewrite can forge or inherit it.
- [ ] ACL resolves the configured official Access peer and provider contract or fails before effects with an actionable peer or version diagnostic; the independent alternative does not imply ACL compatibility.

## Tests

- [ ] Conformance, language-service, Runtime, packed, PostgreSQL, warning, denial, master-audit, and application-isolation suites cover the complete matrix.

## Out of scope

- Publishing the alternative engine.
- Moving master or master-key configuration out of Core.

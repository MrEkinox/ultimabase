# Milestone 15 — Optional Hooks and Access plugins

- Status: active

Prove the public open kernel by extracting the existing Hooks and Access product
systems from Core into official `@ultimabase/hooks-plugin` and
`@ultimabase/access-plugin` packages. Applications must run with neither engine,
and minimal alternative community-style engines must use the same public
kernel. Official Hooks contracts live in the single Hooks plugin package;
independent alternatives own their vocabulary. Access providers share the
contract-only `@ultimabase/access-contracts` protocol. Core master authority
remains unchanged.

## Execution order

1. [x] [1501 — Extract the complete Hooks plugin](1501-hooks-plugin-authoring-contracts.md)
2. [x] [1502 — Merged into issue 1501 by ADR-0202](1502-hooks-plugin-runtime.md)
3. [ ] [1503 — Prove no-Hooks and alternative-Hooks applications](1503-hooks-optional-alternative-proof.md)
4. [ ] [1504 — Move Access authoring and plans into access-plugin](1504-access-plugin-authoring-plans.md)
5. [ ] [1505 — Move Access execution into access-plugin](1505-access-plugin-runtime.md)
6. [ ] [1506 — Adapt ACL, roles, and PostgreSQL policy integrations](1506-policy-provider-migration.md)
7. [ ] [1507 — Prove no-Access, alternative-Access, and Core Master](1507-access-optional-alternative-proof.md)
8. [ ] [1508 — Remove superseded native Hooks and Access surfaces](1508-native-hooks-access-removal-audit.md)
9. [ ] [1509 — Verify optional official capability extraction](1509-optional-capabilities-verification.md)

Milestone 15 begins only after milestone 14 passes its complete public
conformance gate.

Milestone 14 passed that gate in issue 1414. The active resume point is issue
1503; no later extraction issue should begin before its declared dependencies.

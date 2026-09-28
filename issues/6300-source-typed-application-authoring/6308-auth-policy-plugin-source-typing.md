# 6308: Migrate ACL, Roles, and Password Auth source typing

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/password-auth-plugin`
- Depends on: 6307
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate the identity and monotonic-policy vertical to source typing while
preserving its exact security boundaries, owned schemas, operations, model
surfaces, and transport-neutral behavior.

## Acceptance criteria

- [ ] ACL retains exact schema options, field permissions, pointer/role subjects, AND-only protected constraints, Master bypass, and independence from Access.
- [ ] Roles retains its plugin-owned schema, hierarchy and membership invariants, request-subject contribution, direct commands, and absence of authority grants by itself.
- [ ] Password Auth retains its owned User and session schemas, password hashing, sign-up/login/refresh/logout/logout-all behavior, request authentication, session lifecycle, direct User-class methods, and transport-neutral operations.
- [ ] Source types infer exact plugin-owned policy options, static methods, model commands, and operations without generated plugin declarations; owned-schema relationships use the retained Typegen graph.
- [ ] Multiple explicit instances, dependency and peer checks, provider composition, plugin absence, ownership conflicts, privilege timing, and focused diagnostics remain exact.
- [ ] No authentication input, role membership, shaped context, or foreign credential manufactures Core authority.
- [ ] Superseded Typegen descriptors and package-specific compatibility branches are removed as each package migrates.
- [ ] Package READMEs, examples, security documentation, and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Existing unit, type, editor, security, HTTP integration, session, and PostgreSQL suites migrate without dropped assertions.
- [ ] Source and packed applications cover presence, absence, provider composition, direct User methods, and adversarial authority cases without generated plugin-surface declarations.
- [ ] Locked TypeScript performance and memory budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every policy, owned-schema, operation, direct-command, transport, credential, session, and security contract in the three packages.
- [ ] Audit the complete diff for widened access, authority manufacture, ACL/Access coupling, role semantic drift, password/session regressions, ownership leaks, private Core access, per-plugin bridges, stale Typegen, missing packed/source assertions, and postponed documentation.
- [ ] Record each finding and correction in the handoff; rerun affected security and identity verticals plus the complete cross-plugin audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; security behavior may not be weakened to fit the new type projection.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Redesigning authentication, ACL, or role semantics.
- Adding authentication providers or transports.
- Making Roles or authentication a Core authority mode.

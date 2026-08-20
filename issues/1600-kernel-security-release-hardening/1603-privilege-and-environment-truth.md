# 1603: Align enforceable privileges and environmental claims

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1602
- ADR: ADR-0191, ADR-0206

## Goal

Make every reported plugin privilege and environmental claim accurately describe
an observable enforcement or inspection boundary.

## Acceptance criteria

- [ ] Every member of `PluginPrivilege` maps to one concrete Core-owned facade or validation boundary that rejects use when the privilege is absent or denied.
- [ ] A privilege with no enforceable Core boundary is removed, reclassified, or implemented through a proven current consumer; startup diagnostics never call an inert declaration enforceable.
- [ ] `authority:elevate` matches the trust and provenance decision from issue 1601 and cannot imply authority through naming alone.
- [ ] Typegen declares its direct filesystem behavior with the correct environmental claim.
- [ ] PostgreSQL declares its direct network behavior with the correct environmental claim.
- [ ] Every official plugin is audited for direct filesystem, network, process, and native-code behavior, with deliberate claims or documented absence.
- [ ] `denyClaims` and privilege denial diagnostics report plugin ID, exact instance, reason, severity, and the blocked phase consistently.
- [ ] A refining ADR records any closed-vocabulary change instead of rewriting ADR-0191's accepted history.

## Tests

- [ ] Manifest and conformance tests fail when an official plugin omits an expected environmental claim.
- [ ] Focused tests prove every retained privilege gates its advertised facade or boundary before effects.
- [ ] Source and packed-package tests protect the final privilege and claim vocabulary.

## Out of scope

- Pretending Core can intercept arbitrary direct Node.js I/O.
- Adding hypothetical filesystem or network facades without two current consumers or an accepted requirement.
- Expanding privileges into a general security sandbox.

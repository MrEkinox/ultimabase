# ADR-0218: Master bypasses authorization policies

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0116, ADR-0128, ADR-0204, ADR-0205
- Depends on: ADR-0128, ADR-0204, ADR-0205

## Context

UltimaBase defines `master` as trusted server-side authority. The official ACL
authorization policy already bypasses its row restrictions for master, while
the official Access plugin currently enforces inline and compatible-provider
rules unless each rule explicitly allows or bypasses master. Consequently,
`access: false` denies even a trusted master request and applications need
callbacks that merely test `context.access.mode === "master"`.

That behavior conflicts with the intended Parse-style contract: master means
that authorization cannot deny the operation. Per-rule master modes also make
the meaning of master vary across declarations in one authorization engine.

Core's generic protected-policy boundary cannot blindly skip every contribution.
It also carries non-authorization invariants such as ACL reference maintenance
and mutation-shape protection that must remain active for trusted operations.

## Decision

Master bypasses every authorization decision owned by the official Access and
ACL plugins.

The official Access plugin marks its complete protected policy as
`master: "bypass"`. Core skips the policy before operation rules, row filters,
item checks, field restrictions, relation checks, prepared-mutation checks,
mutation-outcome checks, result restrictions, callbacks, or default decisions
run. Therefore every Access declaration, including `false`, applies only to
non-master requests.

Official-compatible Access contributions compose inside that same policy and
cannot override the master contract. The contribution factories remove their
per-contribution `master` option and `AccessContributionMasterMode` type.

ACL keeps its existing master bypass for authorization. Its separate reference
maintenance, mutation-shape, lifecycle, validation, and event behavior remains
active where already required.

Any independent community authorization engine should declare master bypass on
its protected policy to honor the framework authority contract. Core retains
the generic `master: "bypass" | "enforce"` mechanism because it cannot classify
a community constraint as authorization or integrity infrastructure.

## Consequences

- `access: false` means forbidden to ordinary callers and allowed to master.
- Access callbacks never execute for a master request.
- Master reads ignore Access row and output restrictions and master mutations
  ignore Access operation, item, field, and transition restrictions.
- Validation, hooks, transactions, database constraints, and non-authorization
  integrity maintenance are not bypassed.
- Master remains server-only, application-owned, audited, and unforgeable from
  transport input.
- Helpers that only test for master are unnecessary in Access declarations.

# 1601: Refine inactive host privileges

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, documentation
- Depends on: 1509
- ADR: ADR-0191, new refining ADR required

## Goal

Remove privilege names that imply Core-provided host or authority facades which
do not exist, while preserving honest environmental claims and Core-owned Master
authority.

## Acceptance criteria

- [ ] Add an accepted ADR refining ADR-0191 before changing the public taxonomy.
- [ ] Remove `filesystem:read`, `filesystem:write`, and `network:access` from the enforceable privilege vocabulary while no matching Core facade exists.
- [ ] Remove `authority:elevate`; plugins cannot inherit, construct, or request Master authority through a manifest.
- [ ] Preserve `environment:filesystem`, `environment:network`, `environment:process`, and `environment:native-code` as denyable declarations of direct trusted Node.js behavior.
- [ ] Audit policy configuration, startup diagnostics, public exports, examples, generated declarations, and packed consumers for the removed names.
- [ ] Keep advanced but implemented replacement, decoration, persistence, adapter, and Typegen privileges available and document them outside the normal community path.

## Tests

- [ ] Runtime and type tests reject every removed privilege and continue to validate all environmental claims.
- [ ] Security tests prove no plugin capability, dependency, transport, or Runtime middleware receives Master authority.
- [ ] Source and packed public API tests expose one current privilege vocabulary.

## Out of scope

- Adding filesystem, network, Worker, or sandbox facades.
- Changing the trusted in-process plugin threat model.
- Removing implemented expert-level replacement or raw-adapter privileges.

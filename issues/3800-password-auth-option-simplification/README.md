# Milestone 38 — Password Auth option simplification

- Status: completed
- Authorization: user request of 2026-09-25
- Baseline: `6cdc1374`

This milestone removes Password Auth's repeated strict-object validation loops
by using Plugin Kit's existing canonical option boundary. Password, session,
cookie, User, peer, security-floor, default, and diagnostic behavior remain
owned by Password Auth.

## Execution order

- [x] [3801 — Consolidate Password Auth option boundaries](3801-password-auth-option-boundaries.md)

The migration is retained only with a negative production delta and exact
runtime and type parity.

## Final outcome

Password Auth removes 28 production lines by replacing three strict-object
validation implementations and two integer-range implementations with its
existing canonical Plugin Kit boundary and one package-private numeric helper.
All package tests, types, build, repository typecheck, and lint pass with no
public export or declaration change.

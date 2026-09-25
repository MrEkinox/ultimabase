# 3603: Remove static mutation registration

- Status: complete
- Milestone: 36
- Depends on: 3602

## Goal

Resolve schema-class mutation methods from the sole active application's
canonical command graph instead of copying every installed alias into a second
startup-time registry.

## Result

- Removed the startup loop, per-schema mutation maps, ownership singleton, and
  disposal reset used only to mirror compiled command aliases.
- Schema-class proxies now resolve visible aliases from the sole active
  application's canonical command graph and retain the existing execution,
  lifecycle, ownership, and authority boundaries.
- Moved reserved static-member collision validation into command compilation so
  invalid aliases still fail before setup or handler materialization.
- Added a focused regression test for static-member collision atomicity.

Production changed by 52 additions and 64 deletions (`-12` lines). The focused
suite passes 27 tests, the complete Core suite passes 1,330 tests across 258
files, and root typecheck, lint, and the Core build pass. Lint reports the 52
pre-existing line-budget warnings and no errors.

Documentation impact: internal engineering documentation. Static mutation
behavior and the public plugin contract are unchanged, so package READMEs and
public website pages remain accurate; this issue and the active milestone plan
record the internal source-of-truth change.

# Milestone 36 — Native command and application simplification

- Status: completed
- Authorization: user request and architecture approval of 2026-09-25
- ADR: ADR-0272

This milestone applies the native-model simplification rule beyond plugin
definitions: compile command facts once, remove duplicated registration
protocols, consolidate application-owned private state, remove redundant
startup registration, and reduce repeated official-plugin authoring code
without losing a current capability.

## Baseline

- Revision: `aeb53cab42c9cb3a8487612d5c7be38add3a37c1`
- Production: 124,818 lines in 711 files
- Core: 67,327 lines in 349 files (53.94%)
- Tests: 132,264 lines in 729 files
- Public exports: 1,718
- Declaration output: 833,725 bytes

## Execution order

- [x] [3601 — Make command contributions native](3601-native-command-contributions.md)
- [x] [3602 — Consolidate application-owned private state](3602-application-kernel-state.md)
- [x] [3603 — Remove static mutation registration](3603-static-mutation-resolution.md)
- [x] [3604 — Simplify official plugin option and identity authoring](3604-plugin-authoring-reduction.md)
- [x] [3605 — Audit graph planning and shared plugin shells](3605-graph-and-plugin-shell-audit.md)
- [x] [3606 — Prove parity and measure the final reduction](3606-parity-and-reduction-audit.md)

Every issue receives a dedicated commit. A proposed abstraction is retained
only when it removes more production work than it introduces and keeps the
existing security, lifecycle, editor, Runtime, transport, and cleanup contracts.

## Final outcome

The milestone removes 535 production lines and 216 test lines, including 455
lines and one file from Core. It also removes two net public exports and 1,863
bytes of generated declarations. Native command contributions, consolidated
application state, canonical mutation lookup, shared option/path authoring, and
indexed graph planning retain all validated application and plugin behavior.

The full unit, type, performance, coverage, E2E, packed-package, build, lint,
constraint, and website validation loop passes. See issue 3606 for the public
name reconciliation, coverage figures, and remaining reduction candidates.

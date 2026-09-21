# Milestone 31 — Residual complexity simplification

- Status: in-progress

A second bounded simplification pass after the completed milestone 30: remove
proven private dead code and duplicated Hooks/Access machinery, then decide
whether residual compiler and public-protocol scaffolding is still justified.
Preserve current product behavior, stability and used plugin capabilities.

The [detailed plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
owns the preservation contract, validation and mandatory audit loop.
The [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
records initial evidence and explicitly pending decisions. Milestone 30 remains
completed; its metrics and accepted decisions are the historical baseline.

## Authorization

The user authorized autonomous execution on 2026-09-21, with the audit/correction
loop and one commit per completed issue. Issues 3101–3103 are complete; 3104 is next. Compiler
redesign and new public removals retain their exact decision gates; stop for
questions or blockers and explain them before continuing. No push, deployment,
paused feature or later milestone is authorized.

## Execution order

- [x] [3101 — Refresh the baseline and residual-complexity inventory](3101-baseline-and-consumer-inventory.md)
- [x] [3102 — Remove proven unused private Core helpers](3102-remove-unused-private-core-helpers.md)
- [x] [3103 — Remove the unused Access declaration circuit](3103-remove-unused-access-declaration-circuit.md)
- [x] [3104 — Consolidate Hooks declarations and field-path types](3104-consolidate-hooks-declarations-and-field-paths.md)
- [ ] [3105 — Decide the internal schema compilation boundary](3105-decide-direct-internal-schema-compilation.md)
- [ ] [3106 — Simplify canonical schema compilation](3106-simplify-canonical-schema-compilation.md)
- [ ] [3107 — Decide the three unused public protocol candidates](3107-decide-unused-public-protocols.md)
- [ ] [3108 — Remove unused Runtime stage contributions if approved](3108-remove-unused-runtime-stage-contributions.md)
- [ ] [3109 — Remove the unread Typegen emitter marker if approved](3109-remove-unread-typegen-emitter-marker.md)
- [ ] [3110 — Remove unused migration anticipation if approved](3110-remove-unused-migration-anticipation.md)
- [ ] [3111 — Reconcile the affected public website journeys](3111-reconcile-public-website-documentation.md)
- [ ] [3112 — Run the final parity and simplification audit](3112-final-parity-and-simplification-audit.md)

Issues execute sequentially. Each must complete implementation -> validation ->
complete audit -> corrections -> validation -> complete audit, repeated until
zero unresolved findings, followed by one dedicated local commit before the
next issue starts. Report exact added/deleted/net commit line counts and
separate production changes from tests and documentation.

Stop for an architectural question, uncertain consumer, unapproved public loss
or blocked required verification; explain the evidence and wait for direction.
Do not weaken tests or force a refactor to satisfy a line-count target.

Issues 3105 and 3107 record user decisions before their dependent removals.
A retained candidate explicitly supersedes its removal issue; a pending decision
blocks it. Used ACL interceptors, Typegen generation, PostgreSQL synchronization,
private storage, provenance and mandatory compiler validation remain protected.
The accepted retention and superseded status are recorded in the decision
issue's audited commit; no empty implementation commit is required.

## Completion boundary

- All retained contracts and approved deltas are reconciled against 3101.
- Every delivered issue has a green audit and dedicated commit; any superseded
  removal records its accepted retention decision.
- Public changes update the documentation site in the same issue; 3111 reviews
  the whole affected journey again.
- No unused replacement mechanism, unapproved capability loss or coverage
  relaxation is introduced.
- Final measurements and complete validation are recorded in 3112.
- Stop expressly after the 3112 commit. No automatic continuation or push.

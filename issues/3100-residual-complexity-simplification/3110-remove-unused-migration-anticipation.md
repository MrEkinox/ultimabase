# 3110: Remove unused migration anticipation if approved

- Status: planned
- Milestone: 31
- Packages: @ultimabase/core, @ultimabase/postgres-plugin, @ultimabase/testing; only consumers enumerated in 3107
- Depends on: 3109
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0266](../../docs/adr/0266-defer-migration-only-protocols.md), accepted 2026-09-21

## Goal

Remove the exact unused migration scaffolding approved by RC-06 while preserving current PostgreSQL and owner-private persistence.

## Acceptance criteria

- [ ] Require an accepted RC-06 decision naming each removed symbol/privilege/token/metadata field and resolving its engineering-tool consumers. New findings outside that inventory invoke the stop gate.
- [ ] Remove only approved migration-exclusive planning, upgrade/history/preparation pathways and their exclusive fixtures/docs; no placeholder migration package or replacement API.
- [ ] Preserve PostgreSQL override/fail/ignore synchronization and `renamedFrom`, actual desired-schema preparation, every physical contribution snapshot field, plugin-field codecs, private credential/session storage and transaction-bound raw access.
- [ ] Preserve all provenance needed by current storage/ownership/integrity checks and exact privilege-before-effect boundaries. Removing migration metadata must never imply automatic destructive schema cleanup.
- [ ] Retain/rehome required test invariants only through existing internal support under the accepted decision. Report any intentionally removed used testing API explicitly.
- [ ] Update affected public PostgreSQL/plugin-authoring/testing docs and examples in this issue. Reconcile future migration issue assumptions as decided without starting that backlog.
- [ ] Record exact removals, behavior deltas, storage/SQL comparison evidence and preserved contracts in the ledger and root history.

## Tests

- [ ] Run PostgreSQL synchronization/physical-schema, private-storage, Password Auth, adapter lease/provenance and built/packed conformance with real PostgreSQL.
- [ ] Run implementation gates, full coverage as justified by changed shared adapter contracts and affected website checks.

## Audit and commit gate

- [ ] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [ ] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [ ] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [ ] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Removing existing synchronization modes, losing private data/provenance, applying migrations, changing storage formats or creating a migrations product.

## Handoff

Not started. The exact decision was accepted in 3107; follow issue dependencies
and the per-issue validation/audit/commit gate.

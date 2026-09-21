# 3101: Refresh the baseline and residual-complexity inventory

- Status: planned
- Milestone: 31
- Packages: all current packages and repository tooling
- Depends on: 3034
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Establish a reproducible post-milestone-30 baseline and verify every candidate before removal. This issue performs inventory and measurement only.

## Acceptance criteria

- [ ] Record the exact source revision, Node/Yarn/database/runner context, current Git state and measurement commands. Reuse the final milestone 30 matrix as the retained contract, with all its delivered removals already applied.
- [ ] Refresh all six initial findings in the linked inventory. Check imports, aliases, reexports, nominal/dynamic registration, source and packed exports, official plugins, applications, generated projects, real engineering tools and retained test invariants.
- [ ] Identify the 14 private functions individually and distinguish their 304 declaration-body lines from registries, comments, imports and the separate Hooks field-path duplication. Reject any candidate with a live consumer.
- [ ] Record a per-candidate ledger: stable ID, exact symbols/files, owner, real consumers or absence evidence, retained invariants, public/website impact, decision status and required regression evidence.
- [ ] Trace the compiler IR's live consumers, Runtime stage composition versus used ACL interceptors, Typegen marker uniqueness, and migration planning's testing consumer. An export or a self-test alone is not a product use; an engineering invariant still counts.
- [ ] Capture package/source counts, public export sets/declarations, full coverage and existing internal runtime measurements using existing tools. Record compiler representations/registries and representative change fan-out.
- [ ] Carry B/P/C contract IDs forward through a new milestone 31 delta ledger without rewriting milestone 30 evidence. No capability is reclassified as approved for removal by this inventory.

## Tests

- [ ] Build packages before measuring declarations; run the existing source, full-coverage and built/packed/PostgreSQL baseline gates and record environmental blockers.
- [ ] Run issue metadata, relevant boundary checks, formatting, relative-link validation and git diff --check.

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

No production refactor, public removal, new instrumentation API or changes to paused feature work.

## Handoff

Not started. The preparation request does not authorize implementation.

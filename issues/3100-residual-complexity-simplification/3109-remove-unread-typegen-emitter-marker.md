# 3109: Remove the Typegen emitter marker if approved

- Status: planned
- Milestone: 31
- Packages: @ultimabase/core, @ultimabase/typegen; affected conformance/docs
- Depends on: 3108
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0265](../../docs/adr/0265-remove-typegen-emitter-marker.md), accepted 2026-09-21

## Goal

Remove the exact emitter-marker protocol without changing automatic Typegen generation.

## Acceptance criteria

- [ ] Require the accepted RC-05 decision, including uniqueness/inspection/requirement/conditional-privilege deltas and the identified engineering fixture adaptations. Remove the token/interface, inert provider, exclusive exports and marker-only tests.
- [ ] Preserve generic conditional privilege/facade/denial checks using existing generic fixtures. Workflow/value proofs request their existing type references directly; do not rename the emitter marker as test infrastructure.
- [ ] Keep Typegen setup timing before infrastructure, automatic file generation, deterministic fingerprints/output, consumed public type references and JavaScript operation without Typegen.
- [ ] Retain generic plugin identity and capability conflict checks for all remaining protocols. Do not add a replacement emitter registry merely to preserve the removed convention.
- [ ] Compare generated declarations and editor inference against baseline source and packed applications, including initializer-generated TypeScript and JavaScript projects.
- [ ] Update plugin-authoring/Typegen website guidance, package READMEs and exact removal history in the same issue.

## Tests

- [ ] Run Typegen lifecycle, output/fingerprint, language-service, source/built/packed export and initializer checks.
- [ ] Run the implementation gates, relevant conformance and coverage comparisons; verify absence of effects before privilege checks.

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

Removing Typegen, changing generated runtime truth, adding a public emitter selection mechanism or altering remaining capability cardinality.

## Handoff

Not started. The exact decision was accepted in 3107; follow issue dependencies
and the per-issue validation/audit/commit gate.

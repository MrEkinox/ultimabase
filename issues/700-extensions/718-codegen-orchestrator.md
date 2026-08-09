# 718: Add generic codegen orchestrator

- Status: superseded
- Milestone: 7+
- Packages: future codegen package
- Depends on: 207, 716
- ADR: new ADR required
- Superseded by: 806

## Goal

Run generators registered by plugins without Core knowing generated artifact types.

Issue 806 now owns this foundation as part of generated application schema
contracts. Keeping the orchestrator behind the complete future CLI would block
the field declaration and typegen architecture that requires it.

## Acceptance criteria

- [ ] Outputs are deterministic.
- [ ] Generator ownership and conflicts are reported.

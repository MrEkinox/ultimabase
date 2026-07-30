# 718: Add generic codegen orchestrator

- Status: planned
- Milestone: 7+
- Packages: future codegen package
- Depends on: 207, 716
- ADR: new ADR required

## Goal

Run generators registered by plugins without Core knowing generated artifact types.

## Acceptance criteria

- [ ] Outputs are deterministic.
- [ ] Generator ownership and conflicts are reported.

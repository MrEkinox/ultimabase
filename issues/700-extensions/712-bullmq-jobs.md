# 712: Add BullMQ jobs plugin

- Status: planned
- Milestone: 7+
- Packages: future jobs-bullmq package
- Depends on: 706, 617
- ADR: new ADR required

## Goal

Execute jobs with explicit user or master RequestEngine context.

## Acceptance criteria

- [ ] There is no hidden system access mode.
- [ ] Retry and idempotency metadata are available to handlers.

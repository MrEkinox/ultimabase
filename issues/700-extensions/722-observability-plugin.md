# 722: Add observability contracts and OpenTelemetry plugin

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/observability-plugin`
- Depends on: 312, 617
- ADR: new ADR required

## Goal

Trace pipeline stages, adapters, hooks, and transports without hard-coding a vendor.

## Acceptance criteria

- [ ] Sensitive query values are not recorded by default.
- [ ] Runtime works without the plugin.

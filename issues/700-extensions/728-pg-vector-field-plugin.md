# 728: Add the pg-vector field plugin contract

- Status: completed
- Milestone: 7+
- Packages: pg-vector-plugin, schema
- Depends on: 125
- ADR: ADR-0029

## Goal

Prove the community-field contract with a fixed-dimension vector field owned by
an independent plugin package.

## Acceptance criteria

- [x] `vectorField` exposes exact dimensions, common metadata, defaults, and lists.
- [x] Vector snapshots reject invalid dimensions and non-finite components.
- [x] The plugin claims and reads its shared scalar validation plan.
- [x] The package remains independent from PostgreSQL and Drizzle infrastructure.
- [x] Runtime and compile-time tests cover the public API and plan narrowing.

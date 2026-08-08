# 130: Complete the Schema maintainability audit

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 126, 127, 128, 129
- ADR: ADR-0030, ADR-0031, ADR-0032

## Goal

Remove repeated implementation details and align the public documentation with
the completed Schema package before starting Runtime work.

## Acceptance criteria

- [x] Zero-argument fields reuse one empty option definition.
- [x] Primitive scalar default checks and runtime value guards are shared.
- [x] Built-in field discrimination is declared once for snapshots and plans.
- [x] Stateful regular expressions compile to immutable data descriptors.
- [x] Package documentation describes current decimal, plugin, object-default, and update behavior.
- [x] Schema tests, type checks, lint, build, package checks, and coverage pass.

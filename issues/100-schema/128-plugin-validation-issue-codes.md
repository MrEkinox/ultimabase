# 128: Type plugin validation issue codes

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 125
- ADR: 0031

## Goal

Allow community fields to report stable validation issues without opening the
framework-owned issue-code union.

## Acceptance criteria

- [x] Built-in validation codes remain a closed union.
- [x] Plugin codes derive from a namespaced field kind.
- [x] `ValidationIssue` accepts an explicit code union.
- [x] The public package exports combined and plugin-specific helpers.
- [x] Compile-time tests cover a concrete plugin issue code.

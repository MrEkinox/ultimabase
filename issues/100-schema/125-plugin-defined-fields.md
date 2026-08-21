# 125: Preserve plugin-defined fields in validation plans

- Status: completed
- Milestone: 1
- Packages: schema
- Depends on: 115
- ADR: ADR-0029

## Goal

Let community plugins define namespaced logical fields whose complete metadata
survives schema compilation.

## Acceptance criteria

- [x] Schema exposes a typed plugin-field factory without knowing concrete plugins.
- [x] Framework-owned field kinds cannot be shadowed.
- [x] Common field metadata and nested lists reuse the built-in normalization rules.
- [x] Shared scalar plans preserve the immutable plugin field and its logical kind.
- [x] Runtime and compile-time tests cover inference, guards, defaults, and lists.

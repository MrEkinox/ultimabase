# 129: Define object-list update semantics

- Status: completed
- Milestone: 1
- Packages: schema
- Depends on: 116
- ADR: 0032

## Goal

Keep scalar object updates patchable while making regular list updates
unambiguous replacements.

## Acceptance criteria

- [x] Scalar object update children remain optional deep-patch properties.
- [x] Object items inside replacement lists use create-input presence rules.
- [x] Type inference and compiled validation plans produce the same contract.
- [x] Generated, immutable, required, and defaulted child behavior remains consistent.
- [x] Runtime and compile-time tests cover the distinction.

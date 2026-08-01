# 134: Separate validation plan contracts and compilation

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 132, 133
- Refined by: 140

## Goal

Keep public plan types readable while isolating the explicit field compiler and
sharing repeated presence and enum rules.

## Acceptance criteria

- [x] Public validation plan contracts live separately from compiler logic.
- [x] Create presence rules are shared by inference-sensitive runtime paths.
- [x] Enum domains and integer sequence guards have one implementation each.
- [x] Explicit built-in plan compilation remains exhaustive and readable.

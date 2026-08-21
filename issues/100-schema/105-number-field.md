# 105: Implement numberField

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102
- ADR: ADR-0002

## Goal

Implement integer and float number modes.

## Acceptance criteria

- [x] Mode is explicitly `integer` or `float`.
- [x] Min, max, and finite constraints are represented.
- [x] Auto-increment metadata is available only in integer mode.
- [x] A future decimal field is not conflated with JavaScript number.

## Tests

- [x] Runtime and type tests cover both modes.

## Implementation notes

- Numeric constraints use `validation.range.min`, `validation.range.max`, and `validation.finite`.
- Integer boundaries must be safe integers, while float boundaries must be finite JavaScript numbers.
- `autoIncrement` is preserved for integer fields and rejected for float fields.
- Shared field-option and numeric-range normalization keep primitive factories consistent without coupling them.

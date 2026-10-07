# Milestone 60: Canonical operation cancellation

- Status: completed
- Issue: 6001

Make Core's existing cooperative cancellation check the sole public helper used
by Runtime and plugin authors, then remove the identical Hooks implementation.

## Execution order

- [x] [6001: Expose canonical operation cancellation](6001-expose-canonical-operation-cancellation.md)

## Outcome

Core now owns and publicly exports the sole cooperative cancellation helper,
while Hooks imports it directly. The duplicate implementation is gone and
production TypeScript is reduced by 18 lines without changing cancellation,
diagnostic, transaction, or plugin behavior.

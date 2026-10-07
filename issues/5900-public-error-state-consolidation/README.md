# Milestone 59: Public error state consolidation

- Status: completed
- Issue: 5901

Consolidate the repeated immutable public and diagnostic state machinery used
by `FrameworkError` and `PluginError` without changing either public error
contract.

## Execution order

- [x] [5901: Consolidate public error state](5901-consolidate-public-error-state.md)

## Outcome

One private `PublicError` base now owns immutable safe and diagnostic metadata
for both public error classes. Their code validation remains separate, while
production TypeScript is reduced by 20 lines without changing either public
error contract.

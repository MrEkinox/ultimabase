# Current plan: Plugin lifecycle cleanup

- Status: completed
- Milestone: 54
- Baseline: `b1f2de91`
- Completed issue: 5401

The user authorized the next debt-reduction pass after milestone 53. The audit
found that normal plugin disposal and failed setup/start rollback independently
own the same stop, plugin disposal, capability disposal, and terminal-state
sequence.

Core may consolidate only that private cleanup sequence. Normal disposal must
still await an existing stop promise, failure rollback must avoid promise
cycles, cleanup must continue after errors, and application ownership remains
unproven after any cleanup failure. The implementation must delete production
lines overall and introduce no public export.

No push is authorized.

## Outcome

Normal disposal and failed setup/start rollback now share one private resource
release sequence while explicitly controlling whether an existing stop promise
must settle first. Production TypeScript adds 42 lines and removes 58, a net
reduction of 16. `lifecycle-manager.ts` falls from 403 to 387 lines and leaves
the advisory file-size warning list.

# Current plan: Schema command input contracts

- Status: completed
- Milestone: 55
- Baseline: `4697d76d`
- Completed issue: 5501

The user authorized the next debt-reduction pass after milestone 54. The audit
found that schema-command execution declares many overlapping required and
optional key sets and repeats the same untrusted-array validation for every
collection command.

Core may consolidate only those private input-shape contracts and array checks.
Exact accepted keys, diagnostic order and messages, singular targeting,
selection, inclusion, itemization, and batch execution remain unchanged. The
implementation must delete production lines overall and introduce no public
export.

No push is authorized.

## Outcome

One private contract table now owns required and optional schema-command wrapper
keys, and one assertion owns every collection-array diagnostic. Production
TypeScript adds 42 lines and removes 64, a net reduction of 22.
`schema-command-execution.ts` falls from 559 to 537 lines.

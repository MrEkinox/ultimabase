# Current plan: Runtime boundary decoder consolidation

- Status: completed
- Milestone: 45
- Baseline: `6fdb70f8`
- Current issue: completed

The user authorized the follow-up identified by milestone 44's final audit.
Core already validates prepared adapter targets and owns the complete immutable
mutation-outcome boundary, while Access and Hooks repeat partial decoding only
to recover types erased by generic shared stages.

Issue 4501 will expose the smallest existing Core invariant, reuse it in Core,
Access, and Hooks, and delete the official-engine copies. Native CRUD and plugin
schema-mutation execution remain separate. No new lifecycle stage, adapter
power, configuration, or extension registry is introduced.

Issue 4501 is complete. Core now owns one prepared-record decoder and the
existing complete outcome validator; Access and Hooks consume those boundaries
without their former local decoders. Production TypeScript is 41 lines smaller,
all 2,572 repository tests pass, and no resume point remains.

No push is authorized.

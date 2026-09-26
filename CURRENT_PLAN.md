# Current plan: Authoring and repetition consolidation

- Status: in progress
- Milestone: 39
- Baseline: `776b533c`
- Current issue: 3901 (completed)

The user authorized the next debt and DX reduction sequence on 2026-09-25 while
retaining every functional capability.

Issue 3901 replaced Core's separate plugin field-type and contextual builder
declarations with one field-family definition. The same definition covers
fields with or without a builder, retains per-context overrides, and feeds the
existing Runtime and Typegen outputs without a compatibility bridge.

Later bounded issues will address repeated schema-mutation test adapters,
built-in scalar factory typing, and remaining internal mapping or registry
duplication. Each issue keeps its own commit and validation evidence.

Resume by selecting the schema-mutation test-adapter consolidation issue and
proving that its shared fixture removes repetition without hiding behavioral
assertions.

No push is authorized.

# Current plan: Canonical field-input transformation

- Status: completed
- Milestone: 48
- Baseline: `86581f87`
- Current issue: completed

The user authorized the next debt reduction after milestone 47. The Hooks
plugin still owns 613 production lines that duplicate Core's field-input
collection, path traversal, and immutable transformation.

Issue 4801 makes Core's already-implemented field-input transformer a deliberate
public plugin-author helper. Hooks consumes that exact boundary, while its
existing conformance tests continue to protect nested objects, lists, updates,
bulk item isolation, and immutable replacement. No Hook capability or Runtime
stage changes.

Issue 4801 is complete. Core now owns the only field-input transformer, Hooks'
three copied Runtime modules are removed, and production TypeScript is 614
lines smaller. The public helper retains exact operation inference, all 2,575
repository tests pass, and no resume point remains.

No push is authorized.

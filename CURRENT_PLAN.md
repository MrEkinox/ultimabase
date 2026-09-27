# Current plan: Canonical operation cancellation

- Status: completed
- Milestone: 60
- Baseline: `81b8646b`
- Completed issue: 6001

Core Runtime and Hooks currently contain byte-for-byte equivalent cooperative
cancellation helpers. Expose the Core implementation as the canonical public
plugin-authoring boundary and remove the Hooks copy without changing when or
how either engine observes cancellation.

The change must produce a net reduction in production TypeScript and pass the
complete coverage gate plus every standard repository validation command.

No push is authorized.

## Outcome

`throwIfOperationCancelled` is now a documented `@ultimabase/core` package-root
helper used directly by Hooks. The exact Hooks copy was removed, producing a
net reduction of 18 production TypeScript lines while preserving all existing
cancellation semantics and passing the complete validation and coverage gates.

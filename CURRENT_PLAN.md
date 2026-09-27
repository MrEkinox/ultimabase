# Current plan: Public error state consolidation

- Status: completed
- Milestone: 59
- Baseline: `8157563f`
- Completed issue: 5901

`FrameworkError` and `PluginError` currently repeat metadata validation,
immutable detail snapshotting, state initialization, and safe serialization.
Replace those copies with one private Core implementation while retaining both
public classes and their exact observable contracts.

The change must produce a net reduction in production TypeScript and pass the
complete coverage gate plus every standard repository validation command.

No push is authorized.

## Outcome

One private base now owns the common immutable error state while framework and
plugin code validation stays separate. Production TypeScript is reduced by 20
lines, both public error classes retain their exact contracts, and the complete
coverage gate passes.

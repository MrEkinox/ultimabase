# Current plan: Command and declaration simplification

- Status: in-progress
- Milestone: 40
- Baseline: `aa2f0097`
- Current issue: 4003 (planned)

The user authorized another debt and plugin-authoring DX reduction sequence on
2026-09-26 while retaining every functional capability.

Issue 4001 consolidates the private mechanics shared by native operation and
schema-mutation contributions. Their four public factories and distinct Runtime
semantics remain unchanged; both compile directly into the existing canonical
command plan without a cross-module compilation bridge. It was completed with
a net reduction of 59 handwritten production TypeScript lines.

Issue 4002 centralizes exact plain-object and own-key validation across sixteen
Core consumers while retaining every caller-owned diagnostic and the historical
distinction between `Reflect.ownKeys()` and `Object.keys()` boundaries. It was
completed with a net reduction of 12 handwritten production TypeScript lines.

Issues 4003 and 4004 next reduce declaration privilege lookup and schema
add/claim staging. Each change must be private, behavior-preserving, and a net
handwritten production reduction.

Issue 4005 performs the final parity, validation, and line-count audit from
baseline `aa2f0097`.

No push is authorized.

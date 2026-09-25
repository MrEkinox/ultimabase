# Current plan: native command and application simplification

- Status: active
- Milestone: 36
- Baseline: `aeb53cab42c9cb3a8487612d5c7be38add3a37c1`

The user authorized repository-wide continuation of the native-model
simplification on 2026-09-25 and explicitly approved contribution-only command
authoring after the architecture stop identified four public low-level command
provider protocols.

Issue 3601 is complete. Operation and schema-mutation contributions are native,
the approved provider APIs are removed, and command, lifecycle, security,
transport, Typegen, and cleanup behavior retain parity.

Issue 3602 is complete. One private kernel state now replaces the independent
command, capability, privilege, private-storage, plugin-export, and callback
side tables without exposing new public authority.

Issue 3603 is complete. Schema-class mutation aliases now resolve from the sole
active compiled command graph, with no startup copy, secondary registry, or
disposal reset.

Issue 3604 is complete. Five official plugins now share Plugin Kit's strict
option boundary, Apollo Sandbox and GraphiQL no longer repeat package identity
facts, and HTTP owns their reusable browser-bootstrap path normalizer. The
result removes 80 production lines while retaining exact public contracts.

Issue 3605 is active. It audits graph planning and the shared Access/Hooks
shells, implementing only reductions that preserve ordering, privilege,
ownership, and product-specific semantics. Issue 3606 then closes with complete
parity and line measurements.

No push is authorized.

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

Issue 3604 is active. It reduces repeated official-plugin option boundaries and
identity declarations, retaining only helpers with a negative production-line
delta and exact diagnostic, inference, and package-contract parity.

Later issues audit graph and Access/Hooks shells, then close with complete
parity and line measurements.

No push is authorized.

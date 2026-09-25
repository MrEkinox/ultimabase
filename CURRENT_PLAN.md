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

Issue 3603 is active. It removes the static schema-mutation startup registry
and resolves immutable schema/model commands from compiled application handles.

Later issues consolidate application state, remove static mutation
registration, reduce official option and identity duplication, audit graph and
Access/Hooks shells, and close with complete parity and line measurements.

No push is authorized.

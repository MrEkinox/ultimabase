# Current plan: simplify Core-native plugin authoring

The user authorized the complete milestone on 2026-09-25. Creating a plugin
through `@ultimabase/core` must be the shortest canonical path. Plugin Kit may
retain optional domain helpers, but it must not be required to hide Core
registration, capability, operation, Typegen, or public typing boilerplate.

Work through
[milestone 33](issues/3300-core-plugin-authoring-simplification/README.md) in
order. Preserve every current plugin capability, option, privilege, lifecycle,
transport, Typegen, schema, private-storage, and Runtime behavior. This is an
authoring-form migration, not permission to weaken provenance, security,
explicit transport selection, or application isolation.

Each issue receives focused runtime and type tests, a complete diff audit, one
dedicated local commit, and a documentation-impact classification. Temporary
bridges may exist only between consecutive milestone commits and must be gone
before the final audit. Do not push without a separate request.

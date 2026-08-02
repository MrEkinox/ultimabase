# Milestone 2 — Core and plugins

Build application composition without CRUD or infrastructure imports.

Issue 211 added the read-only application service boundary required by the
completed Runtime-to-PostgreSQL vertical. Its original scheduling context is
retained in the [completed plan](../../docs/plans/completed/runtime-postgres-e2e.md).

Issue 212 introduced `new UltimaBase(options)` as the primary public facade. It
builds on the existing `FrameworkApplication` and Runtime assembly without
moving concrete infrastructure into Core.

The active native-hook plan returns to Core only for typed, owner-scoped plugin
contributions. Core remains unaware of hook execution and concrete plugins.

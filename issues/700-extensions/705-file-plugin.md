# 705: Add file plugin and fileField

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/files-plugin`
- Depends on: 103, 617
- ADR: new ADR required

## Goal

Provide storage-adapter-backed file metadata, upload authorization, and a typed
plugin-defined field.

## Acceptance criteria

- [ ] Core and Schema do not know storage providers.
- [ ] Metadata and blob lifecycle are transaction-aware.

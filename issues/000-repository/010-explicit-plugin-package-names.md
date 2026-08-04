# 010: Make plugin package names explicit

- Status: done
- Milestone: 0
- Packages: all official plugins
- Depends on: 009
- ADR: ADR-0121

## Goal

Make every optional plugin immediately recognizable from its workspace folder
and published package name.

## Acceptance criteria

- [x] Every existing plugin directory ends with `-plugin`.
- [x] Every existing plugin `package.json` name ends with `-plugin`.
- [x] Workspace dependencies, imports, release metadata, and TypeScript project references use the renamed packages.
- [x] Foundational and tooling packages remain free of the plugin suffix.
- [x] Future plugin issues follow the same convention.
- [x] Repository guidance and architecture documentation preserve the rule.

## Tests

- [x] Type checking resolves every renamed workspace dependency.
- [x] Unit and package-archive tests consume the renamed public packages.

## Out of scope

- Renaming exported plugin factories or changing their behavior.

# 2810: Document the plugin system

- Status: completed
- Milestone: 28
- Packages: `apps/website`, official plugin packages
- Depends on: 2805
- ADR: none

## Goal

Explain how application developers install and compose plugins and how plugin
authors use the public kernel without requiring readers to understand Core
internals first.

## Acceptance criteria

- [x] Application-developer pages cover installation, configuration, explicit
      behavior installation, dependencies, deterministic ordering, identities,
      and multiple instances.
- [x] The official-plugin index covers every current public plugin package and
      links to its canonical configuration or task page without giving every
      package equal prominence in beginner navigation.
- [x] Authoring pages cover static definitions, manifests, privileges, claims,
      capabilities, dependencies, lifecycle, and `@ultimabase/plugin-kit` at the
      appropriate depth.
- [x] Examples distinguish declaration and application capability lifetimes and
      explain replacement or decoration only where a plugin author needs them.
- [x] No page implies that importing a plugin package installs behavior or that
      Plugin Kit can bypass Core ownership and privilege validation.

## Tests

- [x] Representative plugin-consumer and plugin-author examples compile against
      current public exports.
- [x] The package inventory detects a new or removed official plugin package
      that has no deliberate documentation classification.

## Out of scope

- Security policy tutorials, transport protocols, unshipped plugins, a plugin
  marketplace, or internal capability-host implementation.

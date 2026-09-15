# 2824: Restructure documentation by capability ownership

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2823
- ADR: none

## Goal

Replace the flat task-only documentation navigation with a nested information
architecture that distinguishes Core behavior, official plugins, community
plugins, cross-cutting guides, operations, and reference material.

## Acceptance criteria

- [x] Core-owned application, modeling, query, mutation, Runtime, and authority
      behavior lives below one explicit `Core` section.
- [x] Every shipped official plugin has one canonical section below
      `Plugins > Official Plugins`, grouped by product capability.
- [x] Plugin-owned behavior is removed from Core task sections; those sections
      may link to a plugin but must not duplicate its canonical explanation.
- [x] `Plugins > Community Plugins` explains the future catalog, submission
      workflow, publishing requirements, maintenance ownership, compatibility,
      and non-endorsement boundary without listing fictional plugins.
- [x] Plugin consumption and plugin authoring are separate reader journeys.
- [x] Sidebar labels are not repeated as same-named folder and child entries;
      closely related plugin and troubleshooting tasks use page sections and
      Fumadocs' `On this page` navigation.
- [x] Cross-cutting guides combine several capabilities; plugin-specific setup,
      reference, and troubleshooting remain with the owning plugin.
- [x] Core reference pages are separated from the package index and
      compatibility material.
- [x] Existing version, locale fallback, search, sitemap, edit links, and legacy
      documentation routes remain valid after the navigation change.
- [x] The milestone sitemap, current plan, editorial contract, documentation
      source plan, and ownership map describe the new canonical structure.

## Tests

- [x] Content tests verify the complete nested navigation and reject known
      plugin-owned pages outside their canonical plugin sections.
- [x] Internal documentation links resolve to the new versioned routes.
- [x] Browser coverage verifies the nested Core, official-plugin, and community
      navigation in the standard Fumadocs layout.
- [x] The production website build renders the complete reorganized route set.

## Out of scope

- Publishing or endorsing a real community plugin, creating a package registry
  service, accepting submissions automatically, deploying the site, or changing
  any framework Runtime behavior.

## Completion evidence

- Documentation impact: `public website documentation` — reorganized the full
  English documentation by capability ownership, consolidated related subtasks
  into sectioned long pages, updated the canonical sitemap and ownership data,
  and preserved old URLs through version-aware redirects.
- Focused website typecheck, lint, content validation, production build, and 26
  browser tests pass. Repository typecheck, lint, and build pass. The complete
  Vitest run passed 3,053 of 3,054 tests; its only timeout was the unrelated
  generated minimal REST declaration check, which passed 3 of 3 tests when
  immediately rerun in isolation.

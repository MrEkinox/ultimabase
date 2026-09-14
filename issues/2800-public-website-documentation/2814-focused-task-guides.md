# 2814: Publish focused task guides

- Status: planned
- Milestone: 28
- Packages: `apps/website`, `examples/minimal`, publishable packages
- Depends on: 2806, 2807, 2808, 2809, 2810, 2811, 2812, 2813
- ADR: none

## Goal

Provide concise how-to guides for cross-cutting tasks after their underlying
concepts and API contracts have canonical documentation.

## Acceptance criteria

- [ ] Guides cover validation, Hooks, authenticated APIs, virtual fields,
      nested writes, soft delete, contextual relations, and testing through
      focused use cases.
- [ ] Each guide states prerequisites, one observable outcome, the shortest
      supported path, verification steps, limitations, and related concepts.
- [ ] Guides link to canonical concept and reference pages instead of redefining
      schema, security, plugin, or transport contracts.
- [ ] Copyable commands distinguish developer environment values from trusted
      secrets and never encourage client exposure of Master credentials.
- [ ] Repeated samples share validated fixtures only where that prevents drift
      across at least two concrete pages.
- [ ] Guide titles and search descriptions use reader tasks rather than internal
      issue or ADR terminology.

## Tests

- [ ] Representative end-to-end guide commands execute against maintained
      fixtures where infrastructure permits.
- [ ] Links, headings, prerequisites, and navigation anchors pass content
      validation.

## Out of scope

- Concept reference, exhaustive API signatures, deployment providers, benchmark
  marketing, or tasks requiring unimplemented roadmap capabilities.

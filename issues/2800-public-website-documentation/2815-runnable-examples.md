# 2815: Publish runnable examples

- Status: planned
- Milestone: 28
- Packages: `apps/website`, `examples/minimal`
- Depends on: 2806, 2807, 2808, 2809, 2811, 2812
- ADR: none

## Goal

Turn maintained repository examples into approachable scenario-based journeys
without creating parallel example applications that drift from tests.

## Acceptance criteria

- [ ] The examples index starts with the maintained minimal application and
      identifies its prerequisites, startup command, expected endpoints, and
      pre-release limitations.
- [ ] Scenario pages cover schema modeling, direct queries, REST and GraphQL,
      authentication and Access, nested writes and relations, virtual fields,
      and soft delete by linking to exact maintained source regions.
- [ ] Readers can follow a short happy path without reading the complete source
      file or repository-contributor setup.
- [ ] Examples distinguish copyable application code from test helpers,
      development secrets, and repository-only infrastructure.
- [ ] New standalone examples are added only when an existing maintained
      fixture cannot demonstrate a required reader outcome.
- [ ] Every scenario links back to canonical concept, task guide, and reference
      pages rather than becoming the only documentation of a feature.

## Tests

- [ ] Published example commands and linked source paths are verified from a
      clean built checkout.
- [ ] Relevant minimal-application E2E coverage passes without a website-only
      fork of application behavior.

## Out of scope

- A hosted interactive playground, benchmark marketing, generated sandboxes,
  or examples for unshipped capabilities.

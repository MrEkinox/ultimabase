# 3003: Decide the smaller plugin kernel and canonical graph

- Status: planned
- Milestone: 30
- Packages: architecture documentation, `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`
- Depends on: 3002
- ADR: new ADR superseding or refining ADR-0186 through ADR-0200, ADR-0240, and ADR-0245 where applicable

## Goal

Fix the retained plugin powers and one canonical compiled representation before
removing extension APIs or migrating operations and transports.

## Acceptance criteria

- [ ] Present the complete retained inventory and exact proposed removal list,
      including every observable behavior difference, and obtain the user's
      explicit approval before accepting the ADR.
- [ ] After that approval, an accepted ADR names every retained current plugin capability and the
      required ownership, privilege, ordering, lifecycle, and isolation
      invariant for each.
- [ ] Every capability classified unused by issue 3001 is either selected for
      removal or retained with a concrete required invariant and current
      consumer or supported contract; hypothetical future use is insufficient,
      while ambiguous evidence requires retention and an architecture stop.
- [ ] One canonical compiled command graph owns operation identity, command
      target, authority, input and result contracts, private execution
      reference, developer surfaces, Typegen facts, and transport metadata.
- [ ] The graph contains only facts required by a current execution invariant or
      at least two current projections. Owner-private single-consumer facts stay
      local unless centralization is required to enforce one named invariant.
- [ ] The ADR compares concepts, registries, public exports, and representative
      change fan-out before and after; it may not replace several mechanisms
      with an equally broad generic registry under a new name.
- [ ] Runtime, Typegen, REST, and GraphQL receive immutable least-authority
      projections rather than parallel registries or duplicated declarations.
- [ ] Application operations, request-authority schema mutations, and private
      Master administration retain their distinct semantics within one
      discriminated graph.
- [ ] Core remains product-neutral and official plugins receive no private path.
- [ ] The migration and deletion order prevents a permanent compatibility
      architecture and defines when public pre-1.0 removals occur.
- [ ] No implementation changes in this issue.

## Tests

- [ ] ADR links, package-boundary claims, backlog metadata, formatting, and
      `git diff --check` pass.

## Audit gate

- [ ] Audit the decision against every production plugin and both public
      transports; correct and repeat until every retained feature has one path,
      every removed power is proven unused, and no security invariant depends on
      an omitted contract.
- [ ] Verify that the approved removal list, and only that list, is authorized
      for issues 3004 and 3005. Any later discovery reopens the decision and
      invokes the architecture stop protocol.
- [ ] Record the green audit and Documentation impact before completion.

## Out of scope

- Implementing the canonical graph or removing the selected APIs.

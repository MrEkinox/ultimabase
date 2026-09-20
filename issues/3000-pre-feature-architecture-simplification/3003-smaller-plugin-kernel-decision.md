# 3003: Decide the smaller plugin kernel and canonical graph

- Status: completed
- Milestone: 30
- Packages: architecture documentation, `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`
- Depends on: 3002
- ADR: [ADR-0259](../../docs/adr/0259-smaller-plugin-kernel-and-canonical-commands.md)

## Goal

Fix the retained plugin powers and one canonical compiled representation before
removing extension APIs or migrating operations and transports.

## Acceptance criteria

- [x] Present the complete retained inventory and exact proposed removal list,
      including every observable behavior difference, and obtain the user's
      explicit approval before accepting the ADR.
- [x] After that approval, an accepted ADR names every retained current plugin capability and the
      required ownership, privilege, ordering, lifecycle, and isolation
      invariant for each.
- [x] Every capability classified unused by issue 3001 is either selected for
      removal or retained with a concrete required invariant and current
      consumer or supported contract; hypothetical future use is insufficient,
      while ambiguous evidence requires retention and an architecture stop.
- [x] One canonical compiled command graph owns operation identity, command
      target, authority, input and result contracts, private execution
      reference, developer surfaces, Typegen facts, and transport metadata.
- [x] The graph contains only facts required by a current execution invariant or
      at least two current projections. Owner-private single-consumer facts stay
      local unless centralization is required to enforce one named invariant.
- [x] The ADR compares concepts, registries, public exports, and representative
      change fan-out before and after; it may not replace several mechanisms
      with an equally broad generic registry under a new name.
- [x] Runtime, Typegen, REST, and GraphQL receive immutable least-authority
      projections rather than parallel registries or duplicated declarations.
- [x] Application operations, request-authority schema mutations, and private
      Master administration retain their distinct semantics within one
      discriminated graph.
- [x] Core remains product-neutral and official plugins receive no private path.
- [x] The migration and deletion order prevents a permanent compatibility
      architecture and defines when public pre-1.0 removals occur.
- [x] No implementation changes in this issue.

## Tests

- [x] ADR links, package-boundary claims, backlog metadata, formatting, and
      `git diff --check` pass.

## Audit gate

- [x] Audit the decision against every production plugin and both public
      transports; correct and repeat until every retained feature has one path,
      every removed power is proven unused, and no security invariant depends on
      an omitted contract.
- [x] Verify that the approved removal list, and only that list, is authorized
      for issues 3004 and 3005. Any later discovery reopens the decision and
      invokes the architecture stop protocol.
- [x] Record the green audit and Documentation impact before completion.

## Out of scope

- Implementing the canonical graph or removing the selected APIs.

## Decision and audit handoff

The user approved all ten exact removals in ADR-0259. R-004 includes the
explicit used-API exception: remove the public RuntimeCostProbe and retain its
actual performance measurements internally. A-001–A-003 were presented and
approved separately, then recorded as R-008–R-010. No further approval is needed
for those exact removals or their documented public export changes.

The [decision audit](../../docs/plans/2026-09-20-smaller-kernel-decision-proposal.md)
records the fix/re-audit loop and all sixteen production plugin paths. A source
scan covered 294 production plugin TypeScript files without a call, privilege,
or generic command-map declaration for the removed powers. RuntimeCostProbe
in the Testing package remains the explicit migration obligation. Runnable
examples and tooling were checked separately; the status example is an
application operation and remains supported.

The first audit corrected three false consumer attributions in the baseline.
The next review retained `runtime:observe`, actual Hooks/Access event paths,
Password Auth factory methods, schema/model-bound mutations, mandatory compiler
integrity checks, and real performance measurements. It prohibited a new
metrics capability, private official-plugin substitute, and generic graph
registrar. The final decision audit found no unresolved architecture, scope,
security, or parity finding within the approved removal inventory.

The graph has two closed kinds, with distinct authority/transaction semantics
and private execution references. The ADR justifies every canonical fact,
names least-authority projections, compares concepts/exports/fan-out, and assigns
removal/deletion to individual issues. Issues 3004/3005 and 3008–3012 now name
the accepted scope explicitly; the matrix and root engineering instructions
recognize the migration without rewriting historical ADRs.

Validation: `yarn check:issues` (9 tests), formatting, all 386 local Markdown
links in 17 changed documents, the production consumer scan, and
`git diff --check` pass. Runtime/typecheck/build
checks are not required for this Markdown-only decision. This is a green
decision audit; the implementation issues must prove actual behavior parity.

Documentation impact: internal engineering documentation. Current Runtime,
package APIs, and website behavior do not change here. Issues 3004/3005 update
the affected package READMEs, examples, public website pages, and export/type
tests in the same implementation commit; the later site review does not defer
that requirement.

Scope: the three extra removals extend the original seven after the user's
explicit approval. No implementation code changed. Continue with 3004 only
after this issue's dedicated local commit. No push; hard stop after 3014.

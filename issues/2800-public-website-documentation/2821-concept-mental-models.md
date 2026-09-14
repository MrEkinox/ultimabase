# 2821: Publish the missing concept mental models

- Status: in-progress
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2816
- ADR: 0058, 0099, 0109, 0173, 0186, 0187, 0190, 0191, 0199, 0200, 0206, 0242

## Goal

Complete the approved task-oriented documentation path with the eight concept
pages that explain the framework's cross-cutting mental models without turning
internal architecture into the beginner API.

## Acceptance criteria

- [ ] The English documentation publishes application graph, Runtime pipeline,
      request context, transactions, logical operations and persistence,
      immutability, Typegen, and architecture-decision pages.
- [ ] Each page gives one concise mental model, states the important boundary,
      and links readers to the canonical task or reference pages.
- [ ] Application declarations and the compiled graph remain Runtime truth;
      generated declarations are described only as replaceable tooling.
- [ ] Runtime ordering, policy monotonicity, application-owned Master authority,
      transaction ownership, and persistence-plan replacement match accepted
      contracts.
- [ ] The Concepts section appears in the intended documentation navigation
      order and untranslated French routes use the explicit English fallback.
- [ ] The public ownership plan assigns the concept section to this corrective
      issue without hiding the historical omission from issue 2816.

## Tests

- [ ] Content tests require exactly the eight approved pages, frontmatter,
      source ownership, headings, and valid internal links.
- [ ] Browser coverage verifies the Concepts navigation entry, one complete
      English page, and the French fallback.

## Out of scope

- Exhaustive internal architecture reference, new framework behavior, API
  changes, complete French translation, or rewriting accepted ADR history.

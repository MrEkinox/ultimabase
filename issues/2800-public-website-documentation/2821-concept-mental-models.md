# 2821: Publish the missing concept mental models

- Status: completed
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2816
- ADR: 0058, 0099, 0109, 0173, 0186, 0187, 0190, 0191, 0199, 0200, 0206, 0242

## Goal

Complete the approved task-oriented documentation path with the eight concept
pages that explain the framework's cross-cutting mental models without turning
internal architecture into the beginner API.

## Acceptance criteria

- [x] The English documentation publishes application graph, Runtime pipeline,
      request context, transactions, logical operations and persistence,
      immutability, Typegen, and architecture-decision pages.
- [x] Each page gives one concise mental model, states the important boundary,
      and links readers to the canonical task or reference pages.
- [x] Application declarations and the compiled graph remain Runtime truth;
      generated declarations are described only as replaceable tooling.
- [x] Runtime ordering, policy monotonicity, application-owned Master authority,
      transaction ownership, and persistence-plan replacement match accepted
      contracts.
- [x] The Concepts section appears in the intended documentation navigation
      order and untranslated French routes use the explicit English fallback.
- [x] The public ownership plan assigns the concept section to this corrective
      issue without hiding the historical omission from issue 2816.

## Tests

- [x] Content tests require exactly the eight approved pages, frontmatter,
      source ownership, headings, and valid internal links.
- [x] Browser coverage verifies the Concepts navigation entry, one complete
      English page, and the French fallback.

## Out of scope

- Exhaustive internal architecture reference, new framework behavior, API
  changes, complete French translation, or rewriting accepted ADR history.

## Completion evidence

- Documentation impact: `public website documentation` — the approved Concepts
  section now contains eight source-owned English mental models and explicit
  French fallback behavior.
- Content validation passes 79 tests across 27 files. The production build
  prerenders 114 pages, and 19 browser tests cover the Concepts sidebar,
  English page, French fallback, accessibility, search, and existing journeys.
- No public API, Runtime behavior, package, domain, deployment, or final brand
  decision changed.

## Post-milestone correction

The later Reference audit removed the architecture-decision explainer from the
public docs: it described contribution process rather than current application
behavior. The roadmap links to the repository ADR index for contributors. The
removed pre-launch URL has no redirect.

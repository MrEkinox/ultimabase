# 2803: Build the public landing page

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2802
- ADR: none

## Goal

Create a credible English landing page that explains the product's distinctive
developer experience and directs readers to documentation and source code.

## Acceptance criteria

- [x] The hero communicates the typed-schema, explicit-plugin, and shared API
      Runtime promise without claiming Parse Server compatibility.
- [x] One concise, valid TypeScript example shows a schema and application
      configuration derived from shipped public APIs.
- [x] An accessible diagram explains the common TypeScript, REST, and GraphQL
      pipeline.
- [x] Feature evidence covers PostgreSQL, automatic mutation transactions,
      relationships, validation, security plugins, and Typegen without listing
      unshipped roadmap capabilities.
- [x] Pre-release status is visible and calls to action lead to Getting Started,
      examples, and the configured repository URL.
- [x] Copy and brand labels are split into maintainable components or
      configuration rather than one oversized page module.

## Tests

- [x] The landing page has responsive browser coverage at phone and desktop
      sizes.
- [x] Navigation, calls to action, theme switching, and keyboard focus work
      without client-side errors.

## Completion evidence

- The custom marketing route now presents the typed-schema, explicit-plugin,
  and shared-Runtime promise through an editorial hero, a shipped-API
  application example, and explicit pre-release language.
- A semantic figure connects TypeScript, REST, and GraphQL entry points to one
  ordered Runtime path. Its ordered and unordered lists remain understandable
  without the visual layout.
- Six evidence rows cover PostgreSQL, automatic mutation transactions,
  relationships, validation, security plugins, and replaceable Typegen
  declarations with links into the target documentation architecture.
- Product copy, factual feature data, the architecture figure, the route, and
  provisional site metadata remain split across focused modules. The page
  module only composes the landing component.
- `yarn website:typecheck`, `yarn website:lint`, `yarn website:build`, and
  `yarn website:test` pass. Five Playwright tests cover desktop, 375- and
  320-CSS-pixel layouts, theme switching, CTA destinations, explicit keyboard
  focus, reduced motion, client errors, and Axe WCAG A/AA analysis.
- Repository constraints, issue metadata, formatting, root TypeScript, and
  workspace lint checks pass; workspace lint reports only seven existing
  file-line-budget warnings outside `apps/website`.

## Out of scope

- Pricing, hosted-cloud claims, testimonials, customer logos, newsletter
  capture, competitor comparisons, a blog, or public deployment.

# 2803: Build the public landing page

- Status: planned
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2802
- ADR: none

## Goal

Create a credible English landing page that explains the product's distinctive
developer experience and directs readers to documentation and source code.

## Acceptance criteria

- [ ] The hero communicates the typed-schema, explicit-plugin, and shared API
      Runtime promise without claiming Parse Server compatibility.
- [ ] One concise, valid TypeScript example shows a schema and application
      configuration derived from shipped public APIs.
- [ ] An accessible diagram explains the common TypeScript, REST, and GraphQL
      pipeline.
- [ ] Feature evidence covers PostgreSQL, automatic mutation transactions,
      relationships, validation, security plugins, and Typegen without listing
      unshipped roadmap capabilities.
- [ ] Pre-release status is visible and calls to action lead to Getting Started,
      examples, and the configured repository URL.
- [ ] Copy and brand labels are split into maintainable components or
      configuration rather than one oversized page module.

## Tests

- [ ] The landing page has responsive browser coverage at phone and desktop
      sizes.
- [ ] Navigation, calls to action, theme switching, and keyboard focus work
      without client-side errors.

## Out of scope

- Pricing, hosted-cloud claims, testimonials, customer logos, newsletter
  capture, competitor comparisons, a blog, or public deployment.

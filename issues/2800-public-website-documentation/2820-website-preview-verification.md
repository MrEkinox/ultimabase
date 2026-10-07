# 2820: Harden and verify the website preview

- Status: completed
- Milestone: 28
- Packages: `apps/website`, repository-wide documentation
- Depends on: 2803, 2818, 2819
- ADR: none

## Goal

Audit the website foundation and make it safe to share as a preview without
selecting a permanent domain or deployment provider.

## Acceptance criteria

- [x] Desktop and mobile navigation, search, theme, language selection, and
      every primary call to action work without runtime errors.
- [x] Metadata, social previews, canonical URL configuration, sitemap, robots,
      not-found handling, and favicons use replaceable provisional branding.
- [x] Accessibility review covers keyboard navigation, landmarks, headings,
      focus, contrast, reduced motion, code blocks, diagrams, and search.
- [x] Performance review records production-build sizes and avoids unnecessary
      client components or decorative critical-path media.
- [x] Search review covers representative beginner vocabulary, official package
      names, common errors, French queries, useful zero-result behavior, and
      keyboard-only use.
- [x] Task-based walkthroughs verify that a new reader can install, build a
      first application, find a plugin, secure an API, and diagnose a common
      startup failure without relying on repository-internal knowledge.
- [x] Every product claim, npm command, and code sample is checked against
      shipped behavior or labelled as intended pre-release behavior.
- [x] Root engineering documentation remains excluded from the public content
      graph unless linked deliberately.
- [x] Preview instructions require an explicit hosting decision before public
      deployment and do not hard-code a final domain.

## Tests

- [x] Website lint, typecheck, content validation, browser tests, accessibility
      checks, and production build pass from a clean checkout.
- [x] `yarn constraints`, `yarn check:issues`, `yarn format:check`,
      `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
      `yarn build` pass, with any website-specific build command recorded.

## Out of scope

- Buying a domain, public deployment, analytics, monitoring, a CMS, full French
  parity, final branding, or framework changes made only to simplify docs.

## Completion evidence

- Documentation impact: `public website documentation` — the preview now has
  centralized canonical and social metadata, generated sitemap and robots
  routes, a branded global 404, corrected syntax contrast, and a reproducible
  private-preview readiness record.
- Content validation passes 75 tests across 26 files. The production browser
  audit passes 17 tests across landing, localization, documentation, search,
  responsive layout, reduced motion, accessibility, metadata, and recovery
  paths. The production build prerenders 106 application pages.
- Repository-wide constraints, issue metadata, formatting, diff checks,
  typecheck, 2,357 tests across 503 files, lint, and package build pass. Lint
  retains the existing 90 centralized line-budget warnings and reports no
  errors.
- No domain, hosting provider, public deployment, analytics, or final product
  identity was selected. Public indexing remains disabled.

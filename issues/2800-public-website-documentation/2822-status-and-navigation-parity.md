# 2822: Publish status pages and restore navigation parity

- Status: completed
- Milestone: 28
- Packages: `apps/website`, repository-wide documentation
- Depends on: 2820, 2821
- ADR: none

## Goal

Make every remaining route and global-navigation promise in the approved
sitemap reachable, source-backed, and covered by the private-preview audit.

## Acceptance criteria

- [x] Release status, roadmap, and contributing pages are available under the
      approved English routes with shared localized rendering and explicit
      French fallback behavior.
- [x] Release status distinguishes usable pre-release contracts, intended npm
      installation, and compatibility or publication promises that do not yet
      exist.
- [x] Roadmap distinguishes completed foundations from issue-tracked future
      work without dates or unsupported product claims.
- [x] Contributing summarizes the public workflow, documentation-impact rule,
      verification expectations, and canonical repository sources.
- [x] Global navigation includes the approved Plugins entry, and the landing
      page makes release status discoverable without adding a launch feature.
- [x] Sitemap, metadata, links, ownership data, and preview-readiness evidence
      include the new routes while public indexing remains disabled.

## Tests

- [x] Content validation proves parity between every planned standalone page
      and the implemented route registry.
- [x] Production browser tests cover all three status pages, global Plugins
      navigation, localization fallback, metadata, accessibility, and links.
- [x] Website and repository-wide completion gates pass from the corrected
      sitemap.

## Out of scope

- Public deployment, release dates, npm publication, pricing, analytics, a
  public changelog service, full French parity, or roadmap commitments.

## Completion evidence

- Documentation impact: `public website documentation` — the three approved
  status routes now derive concise public guidance from release, roadmap, and
  contribution sources; Plugins is present in global navigation and release
  maturity is reachable from the landing page. The editorial plan and milestone
  sitemap also use the eight published task-guide slugs, with an exact
  plan-to-content parity check.
- Content validation passes 82 tests across 28 files. The production build
  prerenders 120 pages, and 24 browser tests cover all status routes, the
  French fallback, metadata, navigation, accessibility, search, and the prior
  reader journeys.
- Repository constraints, issue metadata, formatting, diff checks, typecheck,
  2,357 tests across 503 files, lint, and package build pass. Lint reports the
  existing 90 centralized line-budget warnings and no errors.
- No release date, npm publication, domain, provider, deployment, analytics,
  hosted-product claim, or final product identity was introduced. Public
  indexing remains disabled.

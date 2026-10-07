# 2823: Add versioned documentation navigation

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2822
- ADR: none

## Goal

Prepare the public documentation for several maintained UltimaBase release
lines while publishing only the real `1.0` content today.

## Acceptance criteria

- [x] Every documentation page has an explicit version in its canonical URL and
      source path.
- [x] The standard Fumadocs docs layout renders its native version selector.
- [x] English and French pages keep the same version when switching locale or
      falling back to English.
- [x] `/docs` and legacy unversioned documentation URLs redirect to the current
      release line.
- [x] Marketing, examples, status pages, search, metadata, sitemap, edit links,
      and internal documentation links target versioned pages.
- [x] One typed configuration declares supported versions and the current line.
- [x] Contributor guidance explains how to add a real maintained line without
      creating speculative copies or mutating older documentation.

## Tests

- [x] Content tests verify version metadata, canonical URLs, configuration,
      links, search paths, source-edit paths, and translation fingerprints.
- [x] Browser coverage verifies legacy redirects and the visible Fumadocs
      version selector.
- [x] The production website build renders the complete versioned route set.

## Out of scope

- Creating an empty future release line, promising a support window, writing a
  migration guide without a real breaking release, deploying the site, or
  replacing Fumadocs navigation with a custom selector.

## Completion evidence

- Documentation impact: `both` — contributor policy and the public route,
  navigation, search, metadata, and documentation source structure now use an
  explicit release line.
- Fumadocs owns the selector through `root: "version"`; website code owns only
  the supported-version registry and current-version redirects.
- All 47 focused content tests and 25 production browser tests pass. The
  production website build renders 120 static pages, including the complete
  English and French `1.0` route set.
- Repository typecheck, 2,357 tests, lint, and package build pass. Lint retains
  the existing line-budget warnings and required an increased local Node heap
  on this host.

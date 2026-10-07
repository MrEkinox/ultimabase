# 2804: Build the localized documentation shell

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2801
- ADR: none

## Goal

Establish Fumadocs content, routing, navigation, search, and localization
contracts before substantial public documentation is authored.

## Acceptance criteria

- [x] English documentation is served canonically under `/docs` from public MDX
      content owned by the website.
- [x] French documentation can be published under `/fr/docs` through the same
      layouts and components without copying application code.
- [x] Sidebar groups implement the milestone sitemap and hide sections that
      have no published pages.
- [x] Locale switching preserves translated pages and otherwise offers an
      explicit English fallback or nearest translated section.
- [x] Search indexes only public documentation and distinguishes locale without
      indexing root engineering plans or ADRs accidentally.
- [x] Shared MDX components cover code, tabs, callouts, cards, file trees, and
      architecture diagrams with accessible fallbacks.
- [x] Frontmatter validation requires titles and descriptions and supports
      navigation order, release status, and translation metadata.

## Tests

- [x] Static parameters and metadata are generated for every published document
      without duplicate canonical URLs.
- [x] Broken links, invalid frontmatter, and duplicate navigation entries fail
      a focused validation command.
- [x] Search and locale switching have focused browser coverage.

## Completion evidence

- Routes now share one `[lang]` implementation. A guarded proxy keeps English
  canonical at `/` and `/docs`, redirects explicit `/en` URLs, and preserves
  French at `/fr` and `/fr/docs` without a rewrite loop.
- The Fumadocs source uses directory-based `en` and `fr` content with no implicit
  language fallback. Missing French pages resolve to an explicit English-source
  message or a real 404, while translated pages expose distinct canonical and
  language-alternate metadata.
- The task-oriented sidebar contract records all twelve sitemap groups in one
  order and filters groups without published pages. Current English and French
  indexes therefore show no empty future categories.
- The built-in locale-aware search endpoint indexes only
  `apps/website/content/docs`; root engineering plans and ADRs are outside its
  source. Browser coverage proves an English result, a French-only result, and
  locale isolation.
- The MDX registry exposes highlighted code, tabs, callouts, cards, file trees,
  and a semantic ordered-list architecture diagram. The visual flow remains its
  own screen-reader, print, and no-CSS fallback.
- The frontmatter schema requires non-empty titles, descriptions, and release
  status and supports navigation order plus translation source and review date.
- `yarn website:validate` passes five focused content-contract tests for locale
  paths, canonical URL uniqueness, missing-translation resolution, sidebar
  order, empty-group hiding, duplicate metadata entries, and internal links.
  `yarn website:test` passes six Playwright tests covering localized routing,
  search, theme, focus, responsive layouts, client errors, and Axe WCAG A/AA.
- Website typecheck, lint, production build, repository constraints, issue
  metadata, formatting, root TypeScript, and workspace lint all pass. Workspace
  lint reports only seven existing file-line-budget warnings outside the site.

## Out of scope

- Full English or French authoring, machine translation, a CMS, versioned
  documentation, or indexing private repository documentation.

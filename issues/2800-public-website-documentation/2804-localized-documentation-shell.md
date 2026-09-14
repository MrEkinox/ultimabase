# 2804: Build the localized documentation shell

- Status: ready
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2801
- ADR: none

## Goal

Establish Fumadocs content, routing, navigation, search, and localization
contracts before substantial public documentation is authored.

## Acceptance criteria

- [ ] English documentation is served canonically under `/docs` from public MDX
      content owned by the website.
- [ ] French documentation can be published under `/fr/docs` through the same
      layouts and components without copying application code.
- [ ] Sidebar groups implement the milestone sitemap and hide sections that
      have no published pages.
- [ ] Locale switching preserves translated pages and otherwise offers an
      explicit English fallback or nearest translated section.
- [ ] Search indexes only public documentation and distinguishes locale without
      indexing root engineering plans or ADRs accidentally.
- [ ] Shared MDX components cover code, tabs, callouts, cards, file trees, and
      architecture diagrams with accessible fallbacks.
- [ ] Frontmatter validation requires titles and descriptions and supports
      navigation order, release status, and translation metadata.

## Tests

- [ ] Static parameters and metadata are generated for every published document
      without duplicate canonical URLs.
- [ ] Broken links, invalid frontmatter, and duplicate navigation entries fail
      a focused validation command.
- [ ] Search and locale switching have focused browser coverage.

## Out of scope

- Full English or French authoring, machine translation, a CMS, versioned
  documentation, or indexing private repository documentation.

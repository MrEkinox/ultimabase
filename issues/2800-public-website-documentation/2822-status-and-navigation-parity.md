# 2822: Publish status pages and restore navigation parity

- Status: planned
- Milestone: 28
- Packages: `apps/website`, repository-wide documentation
- Depends on: 2820, 2821
- ADR: none

## Goal

Make every remaining route and global-navigation promise in the approved
sitemap reachable, source-backed, and covered by the private-preview audit.

## Acceptance criteria

- [ ] Release status, roadmap, and contributing pages are available under the
      approved English routes with shared localized rendering and explicit
      French fallback behavior.
- [ ] Release status distinguishes usable pre-release contracts, intended npm
      installation, and compatibility or publication promises that do not yet
      exist.
- [ ] Roadmap distinguishes completed foundations from issue-tracked future
      work without dates or unsupported product claims.
- [ ] Contributing summarizes the public workflow, documentation-impact rule,
      verification expectations, and canonical repository sources.
- [ ] Global navigation includes the approved Plugins entry, and the landing
      page makes release status discoverable without adding a launch feature.
- [ ] Sitemap, metadata, links, ownership data, and preview-readiness evidence
      include the new routes while public indexing remains disabled.

## Tests

- [ ] Content validation proves parity between every planned standalone page
      and the implemented route registry.
- [ ] Production browser tests cover all three status pages, global Plugins
      navigation, localization fallback, metadata, accessibility, and links.
- [ ] Website and repository-wide completion gates pass from the corrected
      sitemap.

## Out of scope

- Public deployment, release dates, npm publication, pricing, analytics, a
  public changelog service, full French parity, or roadmap commitments.

# ADR-0343: The website is the single documentation source

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0330 (verified documentation examples), the documentation rules of `AGENTS.md`
- Approval: change-amplification audit of 2026-10-17; cleanup programme approved by the user on 2026-10-17

## Context

A change-amplification audit of the last 150 commits found that the 20 most frequently changed non-test files are all
documentation. One behaviour is described in many places: the default write result in 33 files, Master keys in 35, the
`required` option in 56. Besides `apps/website/content/docs` (66 pages, 15,400 lines), there are:

- 23 package READMEs (11,500 lines; `packages/core/README.md` alone 3,500 lines, changed in 23 of 150 commits);
- `packages/core/docs/*.md` and `packages/core/examples/schema/*.md` (20 files);
- `docs/concepts/*` (10 files);
- user-facing API examples in `ARCHITECTURE.md`.

Every public change rewrites 15 to 45 documentation files, and stale copies survive: old factory names remained in
`docs/concepts` and `ARCHITECTURE.md` after the project layout changed.

## Decision

1. **The website documents behaviour.** `apps/website/content/docs` is the only place that explains how a public API
   behaves, its options, errors and examples.
2. **A package README is a short entry point.** It contains:
   - one or two sentences on what the package is for;
   - installation, including peer dependencies;
   - at most one example, synced from a tested example region (ADR-0330);
   - links to the website pages that document the package;
   - nothing else: no option reference, behaviour description or troubleshooting.
3. **No second user manual.** `packages/core/docs/*.md`, `packages/core/examples/schema/*.md` and `docs/concepts/*` are
   removed. Any content the website lacks moves to the website first.
4. **Engineering documents keep contracts only.** `ARCHITECTURE.md`, `docs/current-architecture.md`,
   `docs/engineering/*` and package-internal design notes describe invariants, dependency direction and runtime order,
   and link to the website for user-facing behaviour instead of repeating its examples.
5. **Rule for changes.** A public change updates the website pages in the same change. It updates a README only when
   the package's purpose, installation, peer dependencies or its single example change.

## Consequences

- A public change touches the website pages that own the behaviour, not every copy.
- npm package pages stay useful: purpose, installation, one verified example, links.
- `AGENTS.md` (documentation rules), `documentation-ownership.json`, page `sources` and the website content tests follow
  the new layout.
- Moving content may reveal behaviour the website never documented; it is added to the website, never dropped silently.
- **Documentation impact:** both.

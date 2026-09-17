# Landing audit improvements — 2026-09-18

Documentation impact: both.

## Delivered behavior

The landing gives developers more of the information needed to evaluate
UltimaBase against other backend frameworks. A capability summary identifies
Core and plugin ownership near the hero. Authentication and access appear
before the detailed modeling section. The desktop composition retains complete,
copyable configuration and schema examples, with readable code and no nested
vertical scroll for the application presets. Mobile preserves the same content.
The established editorial headings remain; additional copy explains concrete
behavior rather than replacing it with broad feature slogans.

The existing operation, row, field, and object ACL explanations are preserved.
A separate code-and-result illustration shows a real Access row policy that
allows ordinary callers to read published articles only. Unspecified mutations
remain denied, and the required plugin is named. The policy is compiled inside
a complete schema with actual Typegen output.

The query section now covers filtering, ordering, limit/offset pagination,
selection, inclusion, count/exists, immutable builders and models, and contextual
relations. Its concrete relation example follows the documented author/post
query. The hero Read example includes stable ordering and offset; its inferred
selected fields are still checked. The hero's published field is explicitly
required with a false default, including the corresponding share-image type.

Plugin authoring copy explains validation of identities, versions, dependencies,
capabilities, and requested privileges before infrastructure starts. Two FAQ
entries cover PostgreSQL schema policies and deployment responsibilities,
including the current absence of an official migration runner.

## Product evidence

- `content/docs/1.0.0/core/reading-data/overview.mdx`: immutable query builders,
  read terminals, and model results.
- `content/docs/1.0.0/core/reading-data/ordering-and-pagination.mdx`: explicit
  ordering, unique tie-breaker, limit, and offset.
- `content/docs/1.0.0/core/reading-data/related-data.mdx`: contextual relation
  filters and some/every/count predicates; filters are not authorization.
- `content/docs/1.0.0/plugins/official/access.mdx`: read allow plus private row
  filter, default-denied mutations, and separate Master authority.
- `content/docs/1.0.0/plugins/overview.mdx`: graph, privileges, and capability
  checks before infrastructure effects.
- `content/docs/1.0.0/plugins/official/postgresql.mdx`: override/fail/ignore and
  the absence of an official migration runner.
- `content/docs/1.0.0/operations/before-exposing-your-application.mdx`: hosting,
  backups, endpoint protection, and monitoring remain application responsibilities.
- `content/docs/1.0.0/plugins/official/soft-delete.mdx`: logical deletion,
  ordinary-read filtering, and private restore/purge commands.

The linked public guides already describe these contracts accurately and need
no MDX changes. No backend API, behavior, dependency, or architecture changed.
The website README and preview-readiness record now describe the current page,
share image, and build rather than superseded preview measurements.

## Metadata and navigation

The landing, Open Graph, and X titles now identify UltimaBase as a TypeScript
backend framework. The description names its typed data APIs and plugin stack.
The landing sitemap review date is current. Preview noindex/nofollow, robots
exclusion, and provisional localhost canonical remain unchanged.

Start building still opens Manual Installation. Source-example labels describe
opening an example instead of implying browser execution. The standard Fumadocs
documentation shell, top-bar links, native GitHub icon, black dark-mode page
background, and footer-free layout are preserved.

## Validation

- `yarn website:validate`: 65 tests passed. Displayed schema, query, validation,
  transport, and policy examples compile against actual public exports and
  generated application declarations.
- `yarn website:typecheck` and `yarn website:lint`: passed.
- `yarn website:build`: passed, 122 prerendered pages.
- `yarn vitest run --project website-browser`: all 52 tests passed, including
  complete preset copying and visibility, keyboard navigation, preview metadata,
  native Fumadocs documentation behavior, and the unchanged onboarding link.
- `yarn constraints`, formatting, and `git diff --check`: passed.
- Full-page production captures reviewed at 1440px and 390px in light and dark;
  additional reflow captures at 320px, 768px, and 1024px show no page overflow.
- A separate local audit at 1440px light, 390px dark, and 320px light found no
  client exceptions or Axe violations under WCAG 2 A/AA, 2.1 AA, and 2.2 AA.
  All landing documentation destinations returned HTTP 200. This is automated
  and visual QA, not an accessibility certification or deployed performance test.

No framework Runtime or PostgreSQL suite was rerun: this change only affects
website presentation, prose, metadata, and source-backed sample checks.

Local review artifacts (not committed):

- `/tmp/ultimabase-landing-review/desktop-light.png`
- `/tmp/ultimabase-landing-review/desktop-dark.png`
- `/tmp/ultimabase-landing-review/mobile-light.png`
- `/tmp/ultimabase-landing-review/mobile-dark.png`
- `/tmp/ultimabase-landing-review/audit.json`

Scope beyond the requested audit: none. No push or deployment is authorized.

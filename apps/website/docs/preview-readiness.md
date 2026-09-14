# Website preview readiness

This record describes the private, locally verified website state. `UltimaBase`,
the repository coordinates, and the canonical origin remain provisional values
from `lib/site.ts`. Public indexing remains disabled until the name, origin,
hosting, and launch policy receive an explicit decision.

## Reader and content audit

The verified reader path covers installation, a first typed application, plugin
installation, an authenticated API, startup diagnosis, the cross-cutting
Concepts section, and all three source-backed status pages. Public search is
checked against beginner vocabulary, package names, stable error identities,
French terminology, keyboard operation, and a useful empty result. The public
content loader reads only `content/docs`; root engineering specifications and
ADRs enter the reader experience only through deliberate links.

Installation commands describe the intended npm, Yarn, and pnpm package
experience. Every affected page remains labelled `pre-release` while the
packages are not yet published. Reusable TypeScript examples compile against
source and built package exports, and maintained Runtime samples execute where a
deterministic adapter or PostgreSQL fixture exists. Semantic claims still
require human review against the frontmatter `sources` list.

## Accessibility and interaction audit

The production-browser suite covers desktop, mobile, 200%-zoom-equivalent
reflow, keyboard focus, search, navigation, language selection, light and dark
themes, reduced motion, page landmarks, headings, code-copy controls, diagrams,
and WCAG A/AA findings. The site overrides two low-contrast GitHub Light syntax
tokens while preserving syntax highlighting.

## Metadata and indexing

Canonical, language-alternate, Open Graph, and X text metadata derive from the
same page title, description, locale, and provisional canonical origin. The
generated favicon uses the replaceable geometric mark. Sitemap, robots, status
metadata, untranslated French fallbacks, and 404 responses have
production-browser coverage. The global navigation exposes the approved Docs,
Plugins, Examples, and GitHub paths.

No social-card image is included while the product name and public domain are
provisional. This prevents a stale branded image from becoming part of the
preview. A final card can be commissioned with the launch identity and added in
the same change as its Open Graph and X image metadata.

## Production build snapshot

The 2026-09-14 Next.js production build prerenders 120 application pages. Its
complete static chunk inventory is 1,604,719 bytes of JavaScript (511,379 bytes
when individually gzip-compressed) and 97,407 bytes of CSS (16,895 bytes when
gzip-compressed). These totals cover every route chunk, not the first-load cost
of one page. The only explicit client boundaries in website source are the
shared brand navigation and the Fumadocs theme/localization provider; no
decorative image is on the critical path.

Reproduce the aggregate measurement after `yarn website:build`:

```bash
find apps/website/.next/static -type f -name '*.js' -print0 | xargs -0 wc -c
find apps/website/.next/static -type f -name '*.css' -print0 | xargs -0 wc -c
find apps/website/.next/static -type f -name '*.js' -print0 | xargs -0 -n 1 gzip -c | wc -c
find apps/website/.next/static -type f -name '*.css' -print0 | xargs -0 -n 1 gzip -c | wc -c
```

## Private preview handoff

Keep the local development server available with `yarn website:dev`. For a
shareable private preview, first make an explicit hosting decision, obtain its
temporary origin, and validate canonical output with that value:

```bash
NEXT_PUBLIC_SITE_URL="$PREVIEW_ORIGIN" yarn website:build
yarn website:test
```

Do not publish from this milestone. Before any public deployment, explicitly
approve the hosting provider, canonical domain, product name, social card,
indexing policy, and any required operational monitoring. Then update only the
central site configuration and repeat the complete verification suite.

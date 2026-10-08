# Website preview readiness

This record describes the private, locally verified website state. `UltimaBase`,
the repository coordinates, and the canonical origin remain provisional values
from `lib/site.ts`. Public indexing remains disabled until the name, origin,
hosting, and launch policy receive an explicit decision.

## Reader and content audit

The verified reader path covers manual installation, a first typed application,
plugin installation, Core concepts, the REST and GraphQL entry points,
application testing, startup diagnosis, and all three source-backed Project
pages. Public search is checked against beginner vocabulary, package names,
stable error identities, keyboard operation, and a useful empty result. The public
content loader reads only `content/docs`; root engineering specifications and
ADRs enter the reader experience only through deliberate links.

Installation commands describe the intended npm, Yarn, and pnpm package
experience. Every affected page remains labelled `pre-release` while the
packages are not yet published. Reusable TypeScript examples compile against
source and built package exports, and maintained Runtime samples execute where a
deterministic adapter or PostgreSQL fixture exists. Semantic claims still
require human review against the frontmatter `sources` list.
The Quick Start page explicitly marks its automatic initializer as unavailable;
it links to the complete manual path rather than implying a generator exists.

## Accessibility and interaction audit

The production-browser suite covers desktop, mobile, 200%-zoom-equivalent
reflow, keyboard focus, search, navigation, light and dark
themes, reduced motion, page landmarks, headings, code-copy controls, diagrams,
per-page Markdown actions, and WCAG A/AA findings. The site overrides two
low-contrast GitHub Light syntax tokens while preserving syntax highlighting.

## Metadata and indexing

Canonical, Open Graph, and X text metadata derive from the
selected page metadata title, description, and provisional canonical origin. The
generated favicon uses the replaceable geometric mark. Sitemap, robots, Project
metadata and 404 responses have
production-browser coverage. Selected documentation pages use a separate search
title while their visible heading and sidebar label stay concise. Markdown
copies remain available with an HTTP canonical link to their HTML reader pages.
The global navigation exposes Documentation,
Plugins, a Project menu, and Fumadocs’ native GitHub icon. The Plugins link opens
the official catalog; Project links to release status, roadmap, and contribution
guidance on desktop and mobile. The landing has no footer. Its main action opens the documentation rather than implying that
unpublished npm packages are ready to install. The former `/examples` pages are removed;
the repository examples remain maintained as source material for guides.

The landing includes a locally generated 1200×630 Open Graph image and a
large-image X card. Its page title identifies UltimaBase as a TypeScript backend
framework. The share image uses the provisional identity and must be reviewed
with the name and domain before launch; its existence does not enable indexing.

## Production build snapshot

The 2026-09-18 production build prerenders 122 application pages, including
Markdown representations of the 57 authored documentation pages and the landing
share image. These route counts are not a first-load performance measurement.
The landing uses semantic HTML, local CSS, and Fumadocs code blocks and tabs;
its first-view proof requires no image download. Full code examples remain visible and copyable on desktop and mobile.
Measure asset totals again after each build instead of treating an older
inventory as current performance evidence.

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

For an approved public build, set `NEXT_PUBLIC_SITE_URL` to its final HTTPS
origin and enable indexing explicitly:

```bash
NEXT_PUBLIC_SITE_URL="https://your-domain.example" NEXT_PUBLIC_SITE_INDEXABLE=true yarn website:build:public
```

The public-build guard rejects `localhost`, non-HTTPS origins, and disabled
indexing. The ordinary build remains suitable for a non-indexable preview.

# UltimaBase website

This private Next.js application hosts the public product site and Fumadocs
documentation. It is part of the Yarn workspace but is excluded from the root
publishable-package build graph.

The product name, release label, repository URL, canonical URL, and navigation
are provisional and centralized in `lib/site.ts`. Set `NEXT_PUBLIC_SITE_URL` to
an absolute preview URL when validating canonical metadata; local development
uses `http://localhost:3000` by default.

## Local development

From the repository root:

```bash
yarn install
yarn website:dev
```

Open `http://localhost:3000`. Marketing routes use the `(marketing)` route
group, while documentation is mounted at `/docs` through the `(docs)` group.
The route implementation lives below `[lang]`: the proxy rewrites canonical
English URLs internally and keeps the explicit `/fr` prefix for French. Public
documentation source belongs in version folders such as
`content/docs/en/1.0` and `content/docs/fr/1.0`; root `docs/` remains the
engineering source for ADRs, specifications, and implementation plans.

Source-backed release status, roadmap, and contribution guidance live at
`/status/*`. Their English routes are canonical; untranslated French routes
render the same explicit fallback contract as documentation pages. The global
Plugins link points directly to the public plugin overview.

## Validation

Run the focused checks before committing website changes:

```bash
yarn website:typecheck
yarn website:lint
yarn website:build
yarn website:validate
yarn website:test
```

The production build creates `.next`, and Fumadocs generates `.source` before
the focused checks. Both are ignored by Git, ESLint, and Prettier. Website
validation covers the application, public content, and browser behavior; Core
and plugin behavior remains owned by the package and repository test suites.
The ordinary root `yarn build` continues to build only non-private publishable
workspaces. Next.js also maintains the conventional tracked `next-env.d.ts`;
repository formatting and linting leave that generated declaration untouched.

## Documentation shell

`lib/i18n.ts` owns the supported locales, labels, URL policy, and UI
translations. English pages use `/docs/<version>`; French pages use
`/fr/docs/<version>`. A missing French translation renders an explicit link to
the same English documentation version and the nearest French documentation
entry instead of silently mixing languages.

Every public MDX page requires a title, description, audience, content type,
reader outcome, owning issue, release status, review date, and canonical
repository sources. Frontmatter may also declare navigation order and
translation source metadata.
`components/mdx.tsx` exposes the standard Fumadocs code, tabs, callouts, cards,
steps, and file-tree components.

The internal [`docs/editorial-contract.md`](docs/editorial-contract.md) defines
page templates, voice, terminology, code-sample rules, and progressive
disclosure. [`docs/source-inventory.md`](docs/source-inventory.md) records which
repository material is suitable for each public area, while
`content/documentation-plan.json` assigns every planned page before authoring.

The `/api/search` index is built only from this public content source and is
locale-aware. `yarn website:validate` generates the typed content, validates
frontmatter, canonical URLs, sidebar ordering, duplicate navigation entries,
and internal documentation links. It never scans the repository's engineering
`docs/` directory.

The documentation navigation is capability-owned. Native application, modeling,
query, mutation, Runtime, and authority behavior lives below `Core`. Optional
behavior lives below `Plugins > Official Plugins` or `Plugins > Community
Plugins`, with one canonical section per plugin. Cross-cutting guides combine
several capabilities; plugin-specific setup, reference, and troubleshooting are
headings on the owning plugin's page instead of repeated sidebar entries.

`Plugin System` explains composition, `Using Plugins` owns consumption and
compatibility, and `Build a Plugin` owns the author journey. Community listings remain visibly
community-maintained even when their documentation is curated on this site.
`Reference` keeps exhaustive Core lookup, the package index, compatibility, and
architecture background outside the primary learning path.

## Documentation versions

Documentation URLs include the framework release line, for example
`/docs/1.0/getting-started/introduction`. `/docs` and legacy unversioned page
URLs redirect to the newest configured line. Fumadocs derives the version
selector from each version folder's `root: "version"` metadata.

To publish another maintained line, add its locale folders and register it in
`lib/docs-versions.ts`, newest first. Reuse relative page paths when the same
guide exists in several versions so switching versions preserves the reader's
location. Do not create an empty version or mutate older documentation to match
new behavior.

## Visual system

Documentation uses the standard Fumadocs docs layout and its official `black`
color preset. `app/theme.css` keeps only the semantic tokens needed by the
custom marketing surfaces. `components/brand-mark.tsx` owns the provisional
geometric mark used by marketing navigation and the generated favicon.

Shared marketing surfaces live under `components/`:

- `brand.tsx` provides the text mark and navigation identity;
- `site-shell.tsx` provides the marketing footer while Fumadocs renders the
  responsive header from the shared options in `lib/layout.tsx`;
- `primitives.tsx` provides buttons, links, sections, code surfaces, and
  callouts.

The browser test builds and starts the production application, then checks the
light and dark shells, mobile and 200%-zoom-equivalent reflow, reduced motion,
focus semantics, localized search and routing, and WCAG A/AA findings with
Playwright and Axe.

[`docs/preview-readiness.md`](docs/preview-readiness.md) records the current
private-preview audit, production asset totals, and the decisions required
before any public deployment.

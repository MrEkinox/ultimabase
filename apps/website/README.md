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

The development server also permits the current LAN preview host
`192.168.1.135` through Next.js `allowedDevOrigins`, so interactive controls
work when the site is opened at `http://192.168.1.135:3000`. If the host's LAN
address changes, update the exact hostname in `next.config.mjs` and restart the
development server. Do not add a wildcard for the local network.

English is the only authored site language. Public documentation source belongs
in version folders such as `content/docs/1.0.0`; root `docs/` remains the
engineering source for ADRs, specifications, and implementation plans.

Source-backed release status, roadmap, and contribution guidance live at
`/status/*` and are linked directly from the landing page's final section. The
global Plugins link points directly to the public plugin overview. The former
`/examples` pages are no longer published; the runnable repository examples
remain available as sources for guides and tests.

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

If a long-running `website:dev` server is open while `website:build` or
`website:test` regenerates `.next`, restart the development server before
checking interactive controls again.

The ordinary root `yarn build` continues to build only non-private publishable
workspaces. Next.js also maintains the conventional tracked `next-env.d.ts`;
repository formatting and linting leave that generated declaration untouched.

## Documentation shell

The site publishes one English route for each page. Readers may use their
browser's page translation, but UltimaBase does not publish or verify translated
documentation. API names, code examples, and security details should be checked
against the authored English page.

Every public MDX page requires a title, description, audience, content type,
reader outcome, owning issue, release status, review date, and canonical
repository sources. Frontmatter may also declare navigation order.
`components/mdx.tsx` exposes the standard Fumadocs code, tabs, callouts, cards,
steps, and file-tree components. Authored Mermaid diagrams use a small
server-rendered SVG component with Fumadocs color variables; keep file contents
and terminal output as code blocks.

The internal [`docs/editorial-contract.md`](docs/editorial-contract.md) defines
page templates, voice, terminology, code-sample rules, and progressive
disclosure. [`docs/source-inventory.md`](docs/source-inventory.md) records which
repository material is suitable for each public area, while
`content/documentation-plan.json` assigns every planned page before authoring.

The `/api/search` index is built only from this public content source.
`yarn website:validate` generates the typed content, validates
frontmatter, canonical URLs, sidebar ordering, duplicate navigation entries,
and internal documentation links. It never scans the repository's engineering
`docs/` directory.

Each versioned documentation page has Fumadocs' Copy Markdown and Open actions.
Its `.md` URL serves processed Markdown from the same authored page, including
the page's release-line path. The Open menu links to the exact source file and
offers external AI shortcuts; those shortcuts can read the page only after the
site has a reachable public URL.

The documentation navigation begins with an `Introduction` sidebar separator:
`Quick Start` previews the unavailable automatic initializer, `What is
UltimaBase` explains the model, and `Manual Installation` is the complete
working first-application path. The initializer's commands are explicitly
non-runnable until its package is published. The remaining top-level areas
also use Fumadocs sidebar separators rather than collapsible parent folders.
Their existing files and URLs stay in `core`, `plugins`, `guides`, `operations`,
and `reference`; the version metadata extracts each folder's immediate items
below its separator. Native application, modeling, query, mutation, Runtime,
and authority behavior lives below `Core`. Optional
behavior lives below `Plugins > Official Plugins` or `Plugins > Community
Plugins`, with one canonical section per plugin. Cross-cutting guides combine
several capabilities; plugin-specific setup, reference, and troubleshooting are
headings on the owning plugin's page instead of repeated sidebar entries.
`Core > Application` is one concept page: its graph, lifecycle, direct
TypeScript, and application-scope sections appear in `On this page` rather than
as separate child routes. Optional Typegen setup lives in the independent
`Guides > Generate TypeScript Types` task page.
`Core > Data Modeling > Virtual Fields` owns the output-only field concept;
the former Guides page is not served.
`Core > Data Modeling > Fields` also owns the built-in builder lookup; there is
no duplicate field-builder page under Reference.
`Core > Data Modeling > Schemas` owns declaration options, indexes, and
application-bound handles; there is no duplicate Schema page under Reference.
The docs sidebar shows the version and page tree without duplicate global
Plugins or GitHub links. Its repository icon sits beside Fumadocs' theme switch
at the bottom; marketing navigation retains the full set of site links.

`Plugin System` explains composition, `Using Plugins` owns consumption and
compatibility, and `Build a Plugin` owns the author journey. Community listings remain visibly
community-maintained even when their documentation is curated on this site.
`Reference` keeps exhaustive Core lookup, the package index, compatibility, and
architecture background outside the primary learning path.

## Documentation versions

Documentation URLs include the framework release line. `/docs/1.0.0` is
"What is UltimaBase"; the introduction also contains
`/docs/1.0.0/quick-start` and `/docs/1.0.0/manual-installation`.
Only current versioned URLs are served; removed and unversioned pages return 404. Fumadocs derives the version selector from each version folder's
`root: "version"` metadata.

To publish another maintained line, add its version folder and register it in
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
focus semantics, search and routing, and WCAG A/AA findings with
Playwright and Axe.

[`docs/preview-readiness.md`](docs/preview-readiness.md) records the current
private-preview audit, production asset totals, and the decisions required
before any public deployment.

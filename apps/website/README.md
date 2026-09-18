# UltimaBase website

This private Next.js application hosts the public product site and Fumadocs
documentation. It is part of the Yarn workspace but is excluded from the root
publishable-package build graph.

The product name, release label, repository URL, canonical URL, and navigation
are provisional and centralized in `lib/site.ts`. Set `NEXT_PUBLIC_SITE_URL` to
an absolute preview URL when validating canonical metadata; local development
uses `http://localhost:3000` by default.

An ordinary `website:build` remains a non-indexable preview by default. A public
build uses `yarn website:build:public` with both `NEXT_PUBLIC_SITE_URL` set to a
public HTTPS origin and `NEXT_PUBLIC_SITE_INDEXABLE=true`. The public build
rejects a local origin or disabled indexing; do not use the preview build as a
public deployment artifact.

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

Source-backed release status, roadmap, and contribution guidance live under
`/docs/1.0.0/project/*` and are linked from the marketing header’s Project menu. The
global Plugins link opens the official-plugin catalog section of the public
plugin overview. The former
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
Selected entry pages may declare `seoTitle` for a descriptive browser/search
title while their shorter `title` remains the visible heading and sidebar label.
Each page's Markdown copy returns an HTTP canonical link to its HTML page.

`components/mdx.tsx` exposes the standard Fumadocs code, tabs, callouts, cards,
steps, and file-tree components. Authored Mermaid diagrams use a small
server-rendered SVG component with Fumadocs color variables; keep file contents
and terminal output as code blocks.
The root HTML includes a static Dark Reader lock because the site already has
native light and dark themes; this prevents the extension from changing SVG
attributes before React hydration.

The internal [`docs/editorial-contract.md`](docs/editorial-contract.md) defines
page templates, voice, terminology, code-sample rules, and progressive
disclosure. [`docs/source-inventory.md`](docs/source-inventory.md) records which
repository material is suitable for each public area, while
`content/documentation-plan.json` assigns every planned page before authoring.

The `/api/search` index is built only from this public content source.
`yarn website:validate` generates the typed content, validates
frontmatter, canonical URLs, sidebar ordering, duplicate navigation entries,
and internal documentation links and heading anchors, including links from the
Project pages. It never scans the repository's engineering `docs/` directory.

Each versioned documentation page has Fumadocs' Copy Markdown and Open actions.
Its `.md` URL serves processed Markdown from the same authored page, including
the page's release-line path. The Open menu links to the exact source file and
offers external AI shortcuts; those shortcuts can read the page only after the
site has a reachable public URL.

`/llms.txt` lists the versioned documentation pages with descriptions and a
pre-release reminder. `/llms-full.txt` combines their processed Markdown for
tools that need one document. Per-page `.md` files convert callouts, cards,
command tabs, file trees, and Mermaid diagrams into readable Markdown while the
HTML pages keep the standard Fumadocs components. Preview builds still block
crawlers through `robots.txt`; the public build switch above makes these routes
available from the published origin.

The documentation navigation begins with an `Introduction` sidebar separator:
`Quick Start` previews the unavailable automatic initializer, `What is
UltimaBase` explains the model, and `Manual Installation` is the complete
working first-application path. The initializer's commands are explicitly
non-runnable until its package is published. The remaining top-level areas
also use Fumadocs sidebar separators rather than collapsible parent folders.
Their existing files and URLs stay in `core`, `plugins`, `guides`, `operations`,
`reference`, and `project`; the version metadata extracts each folder's immediate items
below its separator. Native application, modeling, query, mutation, Runtime,
and authority behavior lives below `Core`. Optional
behavior lives below `Plugins > Official Plugins` or `Plugins > Community
Plugins`. Every official guide is a direct child of `Official Plugins`, with
no category folders. HTTP and its optional Hono server have separate guides;
GraphQL includes Yoga and optional explorers on one page. Each plugin keeps
its own configuration and ownership. Application-level guides cover Typegen
and testing. Plugin-specific setup, reference, and troubleshooting stay as
headings on the relevant page instead of repeated sidebar entries.
`Core > Application` is one concept page: its graph, lifecycle, direct
TypeScript, configuration, and application-scope sections appear in `On this
page` rather than as separate child routes. Optional Typegen setup lives in the independent
`Guides > Generate TypeScript Types` task page.
`Core > Data Modeling > Virtual Fields` owns the output-only field concept;
the former Guides page is not served.
`Core > Data Modeling > Fields` also owns the built-in builder lookup; there is
no duplicate field-builder page under Reference.
`Core > Data Modeling > Schemas` owns declaration options, indexes, and
application-bound handles; there is no duplicate Schema page under Reference.
`Core > Data Modeling > Models` owns draft construction, persisted snapshots,
instance commands, and failure behavior; there is no duplicate model page under
Reference.
`Core > Reading Data > Query Overview` owns read terminals, immutable builders,
branching, and read failures. `Core > Data Modeling > Models` owns immutable
model snapshots. `Core > Writing Data > Transactions` owns both the task and
its Runtime scope; there are no duplicate Runtime pages for immutability or
transaction boundaries. `Core > Runtime > API Error Boundaries` owns the public
`FrameworkError` contract alongside transport boundaries. The Nested Writes
page in Core Writing Data and the Related Data page in Core Reading Data own
their formerly repeated Guides tasks. The former Core API folder under
Reference and those duplicate guides are not served.

The docs sidebar shows the version and page tree without duplicate global
Plugins or GitHub links. Its repository icon sits beside Fumadocs' theme
switch at the bottom; marketing navigation retains the full set of site links.
`Project` groups release status, roadmap, and contribution guidance in the
versioned docs; the landing page is the only separately authored site page.

`Plugin System` explains composition, `Using Plugins` owns consumption and
compatibility, and `Build a Plugin` owns the author journey. Its short entry
page leads to focused schema/Typegen, operation/GraphQL, and
Runtime/infrastructure chapters; those subjects are nested only for authors
who need them. Community listings remain visibly community-maintained even
when their documentation is curated on this site.
`Guides > Test an Application` exercises a public schema command with an
isolated application and disposable PostgreSQL schema; it does not run the
framework's repository test suite. `Reference` keeps one package and
compatibility lookup page outside the primary learning path. The roadmap
links directly to the repository ADR index for contributors. Core's own pages
carry native API lookup beside the concepts and tasks that need it.

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
color preset. `app/theme.css` overrides only the light/dark primary, accent,
and focus colors with the shared blue identity; it also keeps the semantic
tokens needed by custom marketing surfaces. `components/brand-mark.tsx` owns
the provisional geometric mark used by marketing navigation and the generated favicon.
The landing page is the only custom content layout. Its blue introduction
identifies UltimaBase as a TypeScript backend framework, then offers Schema,
Read, and Write tabs with illustrative examples and their model field types.
The precise result types assume generated Typegen declarations;
the example application uses PostgreSQL's
`fail` schema policy and directs first-time readers to Manual Installation.
Plugin composition offers TypeScript, REST, and GraphQL application presets.
Each preset is compiled and its static plugin graph is checked without opening
a database or listener. HTTP presets explicitly include their HTTP/Hono/Yoga
dependencies and explain their local, unprotected evaluation configuration.
A second set of tabs shows requests against the existing minimal example and
explains its shared title Hook; response envelopes remain transport-specific.
Native Commit/Rollback tabs explain two transaction outcomes; they illustrate
the contract without pretending to run a database in the browser. A visible
capability navigation links to application setup, data modeling, identity and
access, and business behavior for readers comparing frameworks.

The capability sections show atomic increments, unique upserts, atomic batches,
typed embedded values, relations and nested writes, a complete virtual-field
schema with its computed result, and Standard Schema validation with Zod.
Identity coverage describes local password authentication, session rotation and
revocation, operation/row/field policies, object ACLs, and roles. Soft deletion
keeps its private Master-only restore/purge boundary visible. Plugin authoring
covers custom operations, fields, model/query extensions, middleware, and
application-specific Typegen declarations. Every capability links to its
existing owning documentation; these guides remain the detailed contract.
Compact section links lead to the detailed capability examples, whose labels
identify Core and plugin ownership. Complete application configurations and virtual-field schemas remain visible
with readable code sizes; configuration tabs and API request tabs have separate labels.
Advanced reads, immutable query builders, contextual relations, and plugin
validation are described with links to their existing contracts.

Marketing styling uses landing-specific selectors in `app/landing.css` and
`app/landing-capabilities.css`; documentation
keeps the standard Fumadocs shell, code blocks, navigation, search, and theme
controls. The examples use server-rendered Fumadocs code blocks and native tabs.
Landing examples disable native copy buttons; documentation retains its
standard copy controls.
The configuration cards share the taller card's height on desktop. Hooks are
presented with the transaction demonstration; the centered FAQ opens its first
answer by default. The closing invitation repeats the hero's themed background
and dot pattern, with links to the runnable example and installation guide.
Mounted tab panels share a grid cell to reserve their tallest content; inactive
panels are visually hidden and excluded from focus and accessibility navigation.
On narrow screens, the short hero examples wrap within their panel; transport
requests and the virtual-field schema use native local code scrolling to
preserve request syntax and schema indentation.
Decorative entry motion respects
reduced-motion preferences. Pre-release status, source availability, and the
Apache-2.0 license are explicit; no initializer or npm publication is implied.
The marketing header offers Documentation, Plugins, and Fumadocs’ native
GitHub icon through `githubUrl`, with a native Project
menu for Release Status, Roadmap, and Contributing. There is no marketing footer.
Six native FAQ disclosures cover hosting, framework scope, Typegen, database
schema policies, deployment responsibilities, and the pre-release contract. The existing Manual Installation entry point is unchanged.

The marketing route generates a local 1200×630 Open Graph image through Next.js
`ImageResponse`, with a large-image X card. Documentation metadata and the
private-preview indexing policy remain unchanged. No remote image or font
service is required to produce the share asset.

Shared marketing surfaces live under `components/`:

- `brand.tsx` provides the text mark and navigation identity;
- `lib/layout.tsx` configures Fumadocs’ responsive marketing header and Project
  menu; documentation keeps its separate standard navigation options;
- `primitives.tsx` provides buttons, links, sections, and callouts.

The content suite compiles the displayed landing examples against public package
exports and real Typegen declarations. The TypeScript checker verifies every
displayed field type; negative checks protect
excluded fields and incorrect assignments. Virtual-field selection and the
displayed Zod rule and Access policy also compile against real generated
application declarations.
On a fresh checkout, run the root
`yarn typecheck` first to emit workspace exports (as CI already does). The sample
check compiles the static application only; it never starts a database connection.

The browser tests build and start the production application, then check the
first-view product proof, complete example visibility, light and dark shells,
mobile and 200%-zoom-equivalent reflow, reduced motion, focus semantics,
search and routing, and WCAG A/AA findings with Playwright and Axe. Landing
interaction checks cover complete example text, the absence of copy controls, stable tab heights, selected
fields, transaction outcomes, and the application-setup anchor.

[`docs/preview-readiness.md`](docs/preview-readiness.md) records the current
private-preview audit, asset measurement instructions, and the decisions required
before any public deployment.

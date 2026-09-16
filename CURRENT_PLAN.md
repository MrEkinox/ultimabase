# Active plan: public website and documentation foundation

- Status: completed
- Milestone: 28
- Created: 2026-09-14
- Current issue: none
- Governing backlog: [Milestone 28](issues/2800-public-website-documentation/README.md)

## Objective

Create one polished, private Next.js workspace for the public product landing
page and Fumadocs documentation. English is the only authored site language;
readers may use browser page translation at their discretion.
The website must describe shipped behavior truthfully, remain easy to rename,
and introduce durable safeguards against documentation drift.

Implementation started on 2026-09-14 after explicit user approval. Work proceeds
one issue at a time with a dedicated verified commit for each issue.

## Approved direction

- The deployable site belongs in `apps/website`, not in `packages/`.
- The workspace is private even though it has its own `package.json`.
- Next.js App Router hosts a custom landing page and Fumadocs documentation in
  one application.
- Root `docs/` retains engineering specifications, plans, concepts, and ADRs.
  Public task-oriented content belongs to the website and may link back to
  engineering history when useful.
- The current `UltimaBase` name, canonical URL, repository URL, and release
  label remain centralized provisional configuration because the final name and
  domain are undecided.
- The site publishes only English canonical routes. It does not maintain
  translated pages, language switching, or translated search indexes.
- Installation guides describe the intended npm experience even before the
  packages are actually published, with honest pre-release labelling.
- The visual direction is clean, editorial, code-led, and product-specific. It
  avoids generic AI imagery, decorative gradient fields, excessive glass
  cards, synthetic mascots, and unsupported marketing claims.
- The first output is a presentable preview, not a public deployment. Hosting,
  domain purchase, analytics, and launch remain later explicit decisions.

## Reader journey

The documentation keeps task-oriented learning paths while making capability
ownership explicit:

```text
Introduction
  → Quick Start (automatic setup not yet available)
  → What is UltimaBase
  → Manual Installation
→ Core
  → Application
  → Data Modeling
  → Reading Data
  → Writing Data
  → Runtime
  → Security Foundations
→ Plugins
  → Plugin System
  → Using Plugins
  → Official Plugins
  → Community Plugins
  → Build a Plugin
→ Guides
→ Operations
→ Reference
```

Core pages own native framework behavior. Optional behavior is canonical only
below its official or community plugin. Guides combine several capabilities;
they do not duplicate plugin setup, configuration, reference, or troubleshooting.
The sidebar stops at coherent subjects; closely related subtasks live in a long
page and its `On this page` navigation rather than repeated nested entries.
Introduction, Core, Plugins, Guides, Operate Your Application, and Reference
are sidebar titles, not additional collapsible levels. Their child routes remain
versioned under their existing folders.

The complete target sitemap, landing narrative, and product boundaries live in
the milestone README. It is the information-architecture
source for implementation issues and must be updated deliberately if navigation
changes.

## Execution plan

Issue 2801 completed the private Next.js and Fumadocs workspace, generated-file
boundaries, provisional typed site configuration, and independent website
validation without entering the publishable package build graph.
Issue 2802 completed the shared token system, provisional brand boundary,
responsive shell primitives, light and dark modes, reduced-motion behavior, and
browser accessibility coverage.
Issue 2803 completed the English product landing page, shipped-API example,
shared Runtime diagram, factual feature evidence, pre-release messaging, and
responsive browser verification.
Issue 2804 completed canonical English and prefixed French routing, explicit
translation fallback behavior, locale-aware public search, shared MDX
components, frontmatter validation, and content-contract checks.
Issue 2805 completed the reader and page-type contract, bilingual terminology,
sample conventions, progressive-disclosure rules, and a validated source and
ownership map for every planned public page.
Issue 2806 completed the five-page English Getting Started journey, compiled
public-export fixtures, package-manager setup, explicit Typegen boundaries, and
browser coverage for the first application and untranslated French fallback.
Issue 2807 completed the seven-page data-modeling path, generated application
contracts, compiled source and built-export fixtures, and focused inference
tests for fields, immutable models, embedded objects, pointers, and relations.
Issue 2808 completed the seven-page read-data path, canonical object and builder
examples, source and built type coverage, and Runtime fixtures for immutable
queries, inclusions, pagination, and relation predicates.
Issue 2809 completed the eight-page write-data path, source and built type
coverage, checked-in generated contracts, public Runtime execution fixtures,
and explicit boundaries for itemized writes, transactions, nested graphs, and
soft deletion.
Issue 2810 completed the eight-page plugin path, compiled consumer and author
fixtures, the complete classified official-plugin catalog, and explicit
contracts for identity, privileges, capabilities, dependencies, and lifecycle.
Issue 2811 completed the seven-page application-security path, generated and
compiled public-export fixtures, executable ACL coverage, and explicit
threat boundaries for identity, Access, Roles, ACL, and application-owned
Master authority.
Issue 2812 completed the six-page public-API path, generated and compiled
public-export fixtures, and one executable application proving equivalent
TypeScript, REST, networkless GraphQL, and Yoga behavior with boundary-owned
wire and error representations.
Issue 2813 completed the six-page operations path, compiled public-export
configuration fixtures, executable lifecycle coverage, repository-derived
compatibility checks, and an explicit inventory of shipped versus missing
production capabilities.
Issue 2814 completed eight focused task guides with one consistent prerequisite,
shortest-path, verification, limitation, and canonical-link structure, backed
by the maintained minimal application's generated-type and TypeScript checks.
Issue 2815 completed a dedicated examples surface over the maintained minimal
application, seven source-linked reader journeys, exact source-region and
canonical-document validation, and the relevant PostgreSQL-backed E2E paths
without introducing a website-only application fork.
Issue 2816 completed nine curated reference pages, source and built-export type
fixtures, verified public defaults, and an exact classified inventory of all
published package roots without exposing deep imports or generated Runtime
truth.
Issue 2817 completed five symptom-first troubleshooting paths for startup,
PostgreSQL, Typegen, HTTP application identity, Password Auth, and safe issue
reporting, backed by public diagnostic identity, link, command, security, and
focused failure-path checks.
Issue 2818 completed the shared French landing and four-page Getting Started
journey, exact cross-language sample reuse, source-fingerprint freshness checks,
translated navigation and accessibility labels, localized search and metadata,
and explicit English fallbacks for untranslated content.
Issue 2819 completed the prospective documentation-impact workflow, exact
package-to-section ownership, reader-visible review dates and source-edit links,
focused bilingual prose checks, and ordinary CI validation while preserving
human review and authoritative engineering sources.
Issue 2820 completed the private-preview gate with production-browser reader
walkthroughs, search and accessibility audits, replaceable technical metadata,
indexing controls, a global recovery page, recorded production asset totals,
and a provider-neutral handoff that performs no deployment.
The subsequent milestone audit found that the approved Concepts section,
standalone status routes, and global Plugins entry remained absent. Issue 2821
published the eight missing mental-model pages; issue 2822 restored status and
navigation parity and reran the final preview gate.
Issue 2823 versioned the documentation source and canonical URLs, initially
under `1.0`, and enabled Fumadocs' native release-line selector. Before launch,
the release line moved to `1.0.0` and legacy-link redirects were removed.
Issue 2824 completed the compact public information architecture around
explicit Core and plugin capability ownership. It also replaced repeated
sidebar task trees with coherent long pages and Fumadocs' page-level table of
contents. The pre-launch cleanup serves only current versioned routes.
The 2026-09-16 post-milestone decision supersedes the previously delivered
French journey: the website now publishes only authored English pages. Browser
translation is available to readers but is not a maintained site capability.
The later post-milestone examples cleanup removes the seven website-only
scenario pages and their index. Repository examples remain maintained for
guides and tests; release status, roadmap, and contributing are linked directly
from the landing page.
The subsequent Getting Started review first reduced that path to Installation
and First Application. The later Introduction revision combines both into one
Manual Installation page and adds a Quick Start page that clearly marks the
automatic initializer as unavailable. "What is UltimaBase" remains the version
root at `/docs/1.0.0`. The manual page owns project files and next-path cards;
the former Getting Started URLs are no longer served. The single Core
Application page now owns graph compilation, lifecycle, direct TypeScript,
and application scope; its former child URLs are no longer served. The later
reader-path audit moved optional Typegen setup to the independent
`/docs/1.0.0/guides/generate-types` guide, leaving the Core page focused on
the application concept.
The later Data Modeling review moved virtual-field behavior into the Core
`/docs/1.0.0/core/data-modeling/virtual-fields` concept page. The former
`/docs/1.0.0/guides/add-virtual-fields` route is removed without a pre-launch
redirect; Guides retains its task workflows.
The Fields page now includes the built-in field-builder lookup in its page-level
contents. The duplicate `/docs/1.0.0/reference/core-api/fields` route is removed
without a pre-launch redirect.
The Schemas page now includes declaration options, indexes, application-bound
handles, and compilation errors. The duplicate
`/docs/1.0.0/reference/core-api/schema` route is removed without a pre-launch
redirect.

### Phase 1 — Application, design, and content foundation

1. Issue 2801 creates only the private Next.js/Fumadocs workspace, typed site
   metadata, route boundaries, development commands, and build integration.
2. Issue 2802 establishes replaceable visual tokens, provisional identity,
   shared navigation, responsive primitives, accessibility, and restrained
   motion.
3. Issue 2803 builds the English landing page after the shared visual system.
4. Issue 2804 may proceed after 2801 in parallel with 2802. It fixes MDX,
   navigation, search, frontmatter, English/French routing, and translation
   fallback contracts before content is authored.
5. Issue 2805 defines audiences, page types, editorial voice, terminology,
   sample conventions, technical sources, and ownership before substantial
   authoring begins.

### Phase 2 — Public English experience

6. Issue 2806 authors and validates the first complete installation and
   application journey.
7. Issue 2807 documents schemas, fields, immutable models, embedded values,
   pointers, and relations.
8. Issue 2808 documents Query, filters, selections, pagination, inclusions, and
   contextual relation reads.
9. Issue 2809 documents mutation commands, nested writes, transactions, and
   soft delete.
10. Issue 2810 documents plugin consumption, official plugin inventory, and the
    public plugin-authoring kernel.
11. Issue 2811 documents identity, Password Auth, Access, Roles, ACL, and Master
    as one accurate security learning path.
12. Issue 2812 documents direct TypeScript, HTTP application, REST, GraphQL,
    Yoga, and error boundaries without flattening their wire differences.
13. Issue 2813 documents configuration, application and server lifecycle,
    PostgreSQL, secrets, browser policy, and provider-neutral production
    boundaries without presenting unshipped operational capabilities as
    available.
14. Issue 2814 adds cross-cutting how-to guides after their canonical concepts
    and contracts exist.
15. Issue 2815 turns the maintained minimal application into runnable reader
    scenarios rather than copying it into website-only examples.
16. Issue 2816 publishes a curated reference and complete public package
    inventory without prematurely generating exhaustive unstable API prose.
17. Issue 2817 adds symptom-first troubleshooting and safe diagnostic paths.

Issues 2806 through 2812 may be implemented in bounded non-overlapping
workstreams only after 2805 fixes the content contract.
The later guides, examples, reference, and troubleshooting issues reuse those
canonical explanations. The primary agent owns navigation integration,
terminology, and validation of all public examples.

### Phase 3 — Historical localization work and long-term currency

18. Issue 2818 originally translated the landing and Getting Started path into
    French. This work was later removed by the 2026-09-16 English-only decision;
    the issue remains a historical completion record.
19. Issue 2819 changes repository contribution rules so every implementation
    classifies public-documentation impact before completion. It adds ownership
    mapping, source edit/report links, review dates, terminology checks, and
    practical sample/content validation without requiring meaningless doc edits
    for internal refactors. It also records when multiple supported release
    lines should trigger versioned documentation.

### Phase 4 — Preview gate and sitemap parity

20. Issue 2820 audits responsive behavior, accessibility, search quality,
    reader task walkthroughs, SEO metadata, links, claims,
    performance, production build, and repository compatibility. It prepares
    preview instructions but does not deploy.
21. Issue 2821 publishes the eight approved cross-cutting concept mental
    models omitted from the first reference pass.
22. Issue 2822 publishes the three approved status routes, restores the global
    Plugins link, and reruns the complete private-preview gate.
23. Issue 2823 gives every public documentation page an explicit release line
    and prepares the native Fumadocs selector for later maintained versions.
24. Issue 2824 replaces the flat task-only sitemap with nested Core, official
    plugin, community plugin, authoring, guide, operations, and reference paths.

## Documentation-currency rule to deliver

Issue 2819 must preserve this distinction:

```text
code change
├── no documentation impact
├── internal engineering documentation impact
├── public website documentation impact
└── both internal and public impact
```

An agent must make and record that classification. Public behavior, exports,
configuration, installation, errors, security semantics, and supported
integrations normally require website review in the same issue. Internal
refactors must not be forced to create meaningless documentation churn.
Automation should compile reusable samples and validate known ownership and
links, while human review remains responsible for semantic prose accuracy.

## Verification protocol

For each issue:

1. Read `AGENTS.md`, this plan, the milestone README, the selected issue, every
   package README in scope, and relevant ADRs completely.
2. Confirm dependencies, inspect the working tree, and preserve unrelated user
   changes.
3. Keep implementation within one issue plus required tests, examples, and
   documentation.
4. Run focused website checks before broader repository gates justified by the
   change.
5. Verify all public code samples against source or built public exports rather
   than copying untested snippets.
6. Update status and completion evidence only after acceptance criteria pass.
7. Create one dedicated commit after the issue is complete, and never push or
   deploy without explicit user approval.

## Stop boundaries

Stop and request direction before:

- selecting or purchasing a permanent domain;
- changing the public product name globally or presenting it as final;
- selecting a public hosting provider or deploying publicly;
- adding analytics, tracking, accounts, newsletter capture, a CMS, blog,
  pricing, hosted-product claims, or comparison marketing;
- introducing a publishable documentation or design-system package without a
  second concrete consumer;
- documenting an unshipped capability as available;
- changing framework APIs merely to make website copy easier;
- replacing the approved information architecture with a materially different
  navigation model.

## Resume protocol

Resume after interruption:

1. Re-read this plan and the current corrective issue.
2. Verify that the current issue remains actionable and that no newer active plan or user
   instruction supersedes it.
3. Inspect local and remote Git state before editing.
4. Verify the implemented site against the approved route architecture rather
   than trusting issue status alone.
5. Complete one corrective issue and its dedicated verification before moving
   to the next.

Resume point: **milestone complete — no remaining issue**.

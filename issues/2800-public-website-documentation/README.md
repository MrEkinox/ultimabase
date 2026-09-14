# Milestone 28 — Public website and documentation

- Status: in-progress

Create one private Next.js application for the public product website and user
documentation. The application lives under `apps/website`, uses Fumadocs for
the documentation experience, and keeps public learning content separate from
the repository's engineering specifications and ADR history.

The product name, domain, visual identity, and release date remain provisional.
Brand metadata must therefore be centralized and replaceable. English is the
first complete language; French uses the same application and information
architecture and may be published progressively without duplicating the site.

## Execution order

1. [x] [2801 — Scaffold the private website application](2801-website-application-foundation.md)
2. [x] [2802 — Establish the provisional visual system](2802-website-visual-system.md)
3. [x] [2803 — Build the public landing page](2803-marketing-landing-page.md)
4. [x] [2804 — Build the localized documentation shell](2804-localized-documentation-shell.md)
5. [x] [2805 — Define the public documentation editorial contract](2805-documentation-editorial-contract.md)
6. [x] [2806 — Author the English getting-started journey](2806-english-getting-started.md)
7. [x] [2807 — Document data modeling](2807-english-data-modeling.md)
8. [x] [2808 — Document reading data](2808-english-reading-data.md)
9. [x] [2809 — Document mutations and transactions](2809-english-mutations-transactions.md)
10. [ ] [2810 — Document the plugin system](2810-english-plugin-system.md)
11. [ ] [2811 — Document application security](2811-english-application-security.md)
12. [ ] [2812 — Document TypeScript, REST, and GraphQL APIs](2812-english-public-apis.md)
13. [ ] [2813 — Document operating an application](2813-operating-an-application.md)
14. [ ] [2814 — Publish focused task guides](2814-focused-task-guides.md)
15. [ ] [2815 — Publish runnable examples](2815-runnable-examples.md)
16. [ ] [2816 — Publish the curated API reference](2816-curated-api-reference.md)
17. [ ] [2817 — Document troubleshooting and diagnostics](2817-troubleshooting-diagnostics.md)
18. [ ] [2818 — Add the first French reader journey](2818-french-reader-journey.md)
19. [ ] [2819 — Guard public documentation against code drift](2819-documentation-currency-guardrails.md)
20. [ ] [2820 — Harden and verify the website preview](2820-website-preview-verification.md)

Issues 2802 and 2804 may proceed independently after 2801. Issue 2805 fixes
audiences, page types, terminology, voice, sample conventions, and source
ownership before English authoring begins. The foundational English sections
may then proceed independently with non-overlapping page ownership. Guides,
examples, reference, and troubleshooting reuse those canonical explanations
instead of restating them. Issue 2803 depends on the visual system. French
translation follows accepted English pages instead of unstable drafts.
Documentation-currency rules follow real content so their ownership map and
checks have concrete targets; the final preview audit depends on those
guardrails.

## Product and content boundaries

- `apps/website` is a private deployable Yarn workspace, not a publishable
  framework package.
- Fumadocs owns the documentation shell and MDX authoring experience. The
  landing page remains a custom Next.js page using the same visual tokens.
- Root `docs/` remains the engineering source for specifications, plans,
  concepts, and ADRs. Public documentation is curated under
  `apps/website/content/docs`; ADRs are optional architectural background, not
  the primary learning path.
- Installation examples assume the intended npm packages are available, while
  the website visibly describes the project as pre-release until publication
  and release readiness are independently verified.
- The provisional product name, canonical URL, repository URL, navigation, and
  release label come from one typed site-configuration boundary.
- The initial identity relies on typography, spacing, restrained color, code,
  and diagrams. It does not require a final logo or generated hero artwork and
  avoids generic AI-product visual conventions.
- English is canonical for the first complete release. French routes share the
  same implementation; untranslated content links clearly to English instead
  of silently mixing languages.

## Target navigation architecture

```text
Global navigation
├── Docs
├── Plugins
├── Examples
├── GitHub
├── Search
├── English / Français
└── Theme
```

The public route architecture is:

```text
/
├── docs
│   ├── getting-started
│   │   ├── introduction
│   │   ├── installation
│   │   ├── first-application
│   │   ├── project-structure
│   │   └── next-steps
│   ├── data-modeling
│   │   ├── schemas
│   │   ├── fields
│   │   ├── models
│   │   ├── defaults
│   │   ├── embedded-objects
│   │   ├── pointers
│   │   └── relations
│   ├── querying
│   │   ├── overview
│   │   ├── filters
│   │   ├── selections
│   │   ├── ordering-and-pagination
│   │   ├── includes
│   │   ├── relation-predicates
│   │   └── contextual-relations
│   ├── mutations
│   │   ├── create
│   │   ├── update
│   │   ├── delete
│   │   ├── bulk-operations
│   │   ├── upserts
│   │   ├── nested-writes
│   │   ├── transactions
│   │   └── soft-delete
│   ├── security
│   │   ├── overview
│   │   ├── password-authentication
│   │   ├── request-identity
│   │   ├── access
│   │   ├── roles
│   │   ├── acl
│   │   └── master-authority
│   ├── apis
│   │   ├── typescript
│   │   ├── http-applications
│   │   ├── rest
│   │   ├── graphql
│   │   ├── graphql-yoga
│   │   └── errors
│   ├── plugins
│   │   ├── overview
│   │   ├── installation
│   │   ├── official-plugins
│   │   ├── authoring
│   │   ├── identity-and-instances
│   │   ├── manifests-and-privileges
│   │   ├── capabilities
│   │   └── lifecycle-and-dependencies
│   ├── operations
│   │   ├── configuration-and-environment
│   │   ├── application-lifecycle
│   │   ├── postgres
│   │   ├── secrets-and-master-key
│   │   ├── browser-policy
│   │   └── production-checklist
│   ├── guides
│   │   ├── validation
│   │   ├── hooks
│   │   ├── authenticated-api
│   │   ├── virtual-fields
│   │   ├── nested-writes
│   │   ├── soft-delete
│   │   ├── contextual-relations
│   │   └── testing
│   ├── concepts
│   │   ├── application-graph
│   │   ├── runtime-pipeline
│   │   ├── request-context
│   │   ├── transactions
│   │   ├── logical-operations-and-persistence
│   │   ├── immutability
│   │   ├── typegen
│   │   └── architecture-decisions
│   ├── troubleshooting
│   │   ├── startup
│   │   ├── postgres
│   │   ├── typegen
│   │   ├── http-and-application-identity
│   │   └── reporting-a-problem
│   └── reference
│       ├── application-configuration
│       ├── schema
│       ├── fields
│       ├── query
│       ├── models
│       ├── plugin-manifests
│       ├── official-plugin-options
│       ├── errors
│       └── packages
├── examples
├── status
│   ├── release-status
│   ├── roadmap
│   └── contributing
└── fr
    ├── docs
    ├── examples
    └── status
```

The unprefixed routes are canonical English URLs. French pages mirror published
content below `/fr`. Locale switching preserves the page when a translation
exists and otherwise offers the nearest translated section plus a clear link to
the English source.

## Landing-page narrative

The home page follows one reader journey rather than enumerating packages:

1. State the typed-schema, explicit-plugin, shared-Runtime promise.
2. Show one small real schema and application configuration.
3. Explain the common TypeScript, REST, and GraphQL path visually.
4. Present plugins as explicit composition rather than bundled magic.
5. Prove PostgreSQL, security, relationship, and developer-tooling capabilities
   with links to documentation.
6. State the pre-release status honestly.
7. End with Documentation and GitHub calls to action.

The page should feel editorial and product-specific: strong typography, a
restrained neutral palette with one distinctive accent, crisp borders, and
purposeful code or architectural diagrams. Avoid decorative gradients,
floating glass cards, synthetic mascots, generic network globes, and claims
without repository evidence.

## Stop boundaries

- Do not publish, reserve, or hard-code a final product name or domain.
- Do not create a publishable documentation package without a second proven
  consumer.
- Do not expose planned capabilities as shipped features.
- Do not turn historical ADRs into beginner documentation or rewrite accepted
  ADRs to simplify website copy.
- Do not add analytics, newsletter capture, accounts, a CMS, a blog, pricing,
  hosted-product claims, or comparison tables without separate approval.
- Do not require full French parity to publish the English preview.
- Do not deploy publicly until hosting and public-release decisions are
  explicit.

## Completion gate

The milestone closes only after the English landing and initial documentation
journeys are responsive, accessible, searchable, link-checked, and verified by
a production build. The first French landing and getting-started path must use
the same components and content contract. Product claims and samples must match
shipped behavior, while provisional brand and deployment configuration remain
replaceable. Repository contribution rules must also require an explicit public
documentation-impact review for future code changes.

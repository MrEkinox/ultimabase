# Landing discovery additions

- Request: implement review proposals 2–5; explicitly exclude proposal 1.
- Reviewed: 2026-09-18.
- Documentation impact: **both**.

## Delivered scope

The shared-runtime diagram becomes a TypeScript / REST / GraphQL demonstration
using the repository's existing minimal example. It shows the same title being
trimmed by that example's real field Hook. The examples use distinct slugs so
trying multiple versions does not introduce a uniqueness collision. Captions
state the started-application, endpoint, JSON, and application-header context.
The result explains a contract; it does not pretend to execute a live request.

The application panel offers complete TypeScript, REST, and GraphQL presets.
They preserve PostgreSQL's fail schema policy and Typegen. HTTP variants add
HTTP and Hono explicitly; GraphQL adds both its network-independent plugin and
Yoga adapter. The required exposure acknowledgement is visible and explained:
these are local evaluation configurations without an authorization policy.
No credentials or Master authority are introduced.

Four native details/summary disclosures answer questions about hosting, scope,
Typegen, and pre-release status, linking to their authoritative public guides.
A local Next.js ImageResponse produces the landing's 1200×630 share image with
a large-image X card, the existing geometric mark, and accurate schema types.
It uses no downloaded images or external font service.

The primary Start building link still opens Manual Installation. No installation
instructions, existing entry points, documentation components, indexing policy,
backend functionality, or dependencies changed. There is no work beyond the
four approved proposals.

## Evidence and verification

Sources reviewed include root architecture and product contracts, the minimal
example README and schema/application files, and the HTTP, Hono, REST, GraphQL,
Yoga, PostgreSQL, and Typegen package contracts. FAQ answers follow the existing
Overview, Runtime, Typegen, and Release Status guides. Next.js's bundled metadata
and ImageResponse documentation defines the share-image integration.

- 62 content tests passed. New tests compile all three displayed configurations,
  generate real Typegen declarations to validate their static graphs, and
  typecheck the direct request against the existing minimal application.
- Production build passed with 122 generated pages.
- All 52 browser tests passed. New coverage exercises both sets of tabs,
  keyboard FAQ controls, expanded-state accessibility, the excluded primary
  navigation change, the actual PNG signature/dimensions, share metadata, and
  retained noindex policy.
- Final mobile request formatting was followed by focused browser verification.
- Website typecheck, lint, Prettier, and git diff checks passed.
- Full-page desktop/mobile captures in both themes were reviewed, with additional
  320px, 768px, and 1024px reflow checks, expanded GraphQL/FAQ captures, and the
  actual generated share image.

No database or remote HTTP request was executed by the demo checks. The backend
transaction, REST, and GraphQL integration suites were not rerun because this
change only presents their existing contracts on the website.

Local review artifacts, not committed:

- `/tmp/ultimabase-landing-review/desktop-light.png`
- `/tmp/ultimabase-landing-review/desktop-dark.png`
- `/tmp/ultimabase-landing-review/mobile-light.png`
- `/tmp/ultimabase-landing-review/mobile-dark.png`
- `/tmp/ultimabase-landing-review/additions-expanded-mobile.png`
- `/tmp/ultimabase-landing-review/share-image.png`

No push or deployment is authorized or included.

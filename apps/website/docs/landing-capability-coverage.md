# Landing capability coverage

- Request: surface documented product capabilities for readers comparing UltimaBase with other backend solutions.
- Reviewed: 2026-09-18.
- Documentation impact: **both**.

## Delivered scope

The landing now makes previously absent or understated capabilities discoverable
without opening a demo tab or leaving the page. Its navigation jumps to the
application, data-modeling, identity/access, and business-behavior sections.
The original typed API proof, transport examples, transaction demonstration,
pre-release contract, and Manual Installation entry point remain in place.

The former relationship/security/Typegen summary is replaced by more specific
content. Obsolete components, data, and styles are removed. No backend APIs,
dependencies, documentation routes, or standard Fumadocs components change.

| Landing capability                                               | Authoritative public guide reviewed                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Atomic increments, upserts, itemized atomic batches              | Core / Writing Data / Update, Unique Upserts, Bulk Operations             |
| Embedded objects, lists, enums, exact decimals, constraints      | Core / Data Modeling / Fields, Embedded Objects, Schemas                  |
| Relations and atomic nested writes                               | Core / Data Modeling / Relationships; Core / Writing Data / Nested Writes |
| Computed, selectable output-only fields                          | Core / Data Modeling / Virtual Fields                                     |
| Standard Schema / Zod validation                                 | Plugins / Official Plugins / Validation                                   |
| Local passwords, sign-up/login, refresh/logout, Bearer/cookies   | Plugins / Official Plugins / Password Authentication                      |
| Operation, row, field, object, and role-based policies           | Plugins / Official Plugins / Access, Object ACLs, Roles                   |
| Recoverable soft deletion and private restore/purge              | Plugins / Official Plugins / Soft Delete                                  |
| Custom operations, fields, model/query surfaces, generated types | Plugins / Build a Plugin and its focused chapters                         |
| Input normalization, transactional work, post-commit events      | Plugins / Official Plugins / Hooks                                        |

Root product/architecture contracts, relevant package contracts, and accepted
virtual-field and soft-delete ADRs were also reviewed. Website documentation
already describes these contracts accurately and requires no content rewrite.
The website README records the new presentation and validation coverage.

## Boundaries retained

The new capability groups identify Core behavior and optional plugins. Password
authentication is explicitly local and excludes recovery, MFA, and a built-in
rate limiter. Identity does not grant access. Soft-delete restore and purge
require audited server-side Master authority. Generated types remain declarations.
No pgvector persistence, similarity search, new providers, production-readiness
claim, competitor comparison, or unimplemented workflow is advertised.

Illustrations explain behavior rather than pretending to execute a database.
The virtual-field example is complete schema code; the displayed Zod expression
is checked inside a real field declaration with the Validation plugin installed.
There is no implementation beyond the requested landing coverage and its checks.

## Verification

- `yarn website:validate`: 64 tests passed in 17 files. New checks compile the
  virtual-field schema and displayed Zod rule against public exports and actual
  generated declarations; negative checks protect selected-result boundaries.
- `yarn website:build`: passed; 122 static pages generated.
- `yarn vitest run --project website-browser`: all 52 tests passed in eight
  files after the final corrections. Coverage includes documentation links,
  light/dark accessibility, capability-anchor positioning, visible Core/plugin
  labels, and exact clipboard contents for the new schema example.
- `yarn website:typecheck`, `yarn website:lint`, Prettier, and `git diff --check`:
  passed.
- Full-page 1440px desktop and 390px mobile screenshots reviewed in light and
  dark themes. Additional 320px, 768px, and 1024px captures have no page-level
  horizontal overflow. Dark mode retains a black page background.
- Visual review corrected an inherited mobile rule that hid capability ownership
  labels, and preserved the virtual schema's indentation through local code
  scrolling. A browser regression assertion protects those labels.

Captures are local review artifacts, not committed:

- `/tmp/ultimabase-landing-review/desktop-light.png`
- `/tmp/ultimabase-landing-review/desktop-dark.png`
- `/tmp/ultimabase-landing-review/mobile-light.png`
- `/tmp/ultimabase-landing-review/mobile-dark.png`

Backend runtime and PostgreSQL integration suites were not rerun: this change
only presents existing contracts, and the new sample checks compile the static
application without connecting a database. No push or deployment was performed.

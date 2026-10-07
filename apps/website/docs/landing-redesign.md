# Landing redesign handoff

- Request: landing-only redesign, authorized directly by the user.
- Reviewed: 2026-09-18.
- Documentation impact: **both**.

## Delivered scope

The landing identifies UltimaBase as a TypeScript backend framework, explains
its schema and plugin model, and leads to Manual Installation and the runnable
repository example. English copy preserves the pre-release, unpublished-package,
Node.js 24+, and Apache-2.0 boundaries.

The complete Fumadocs landing informed the composition: a large colored opening,
a readable product introduction, alternating demonstration panels, concrete
capability illustrations, and a distinct closing action. Text, diagrams, code,
and the blue coordinate pattern are specific to UltimaBase; no reference assets
or marketing claims were copied.

The page uses server-rendered code and diagrams, the existing native Fumadocs
tabs, and landing-scoped CSS. No additional production dependencies, fonts,
tracking, backend functionality, or image downloads were introduced. At the
user’s request, the marketing footer is removed and its unique links
move to the native Project menu in the responsive top bar. The Docs label
becomes Documentation, and Fumadocs’ native `githubUrl` option supplies the
GitHub icon instead of a normal navigation link. The dark theme uses a true
black page background with subtly raised panels and the blue accent. The standard
documentation layout, components, routes, search, theme controls, and navigation
remain unchanged. No work exceeds the authorized landing scope.

The installed Fumadocs version gives its native GitHub SVG an unnamed image
role. A decorative wrapper hides that SVG from the accessibility tree while
preserving Fumadocs' labelled link and native navigation behavior.

## Product evidence

| Claim or demonstration                              | Reviewed source                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Backend framework, Node.js, license, release status | Root `README.md`, `package.json`, `LICENSE`, public Release Status              |
| Schema, model snapshots, selected results           | `packages/core/README.md`, public Schemas and Selections                        |
| Precise generated application types                 | `packages/typegen/README.md`, public Generate TypeScript Types                  |
| PostgreSQL composition and schema policy            | `packages/postgres-plugin/README.md`, public PostgreSQL and Manual Installation |
| Shared operation engine                             | `ARCHITECTURE.md`, ADR-0004, public Runtime Pipeline                            |
| Automatic mutation transactions                     | ADR-0099, public Transactions                                                   |
| Optional Hooks, Access, ACL, identity               | ADR-0189, `ARCHITECTURE.md`, public Security Model                              |

The displayed snippets are compiled together with actual Typegen output through
public package exports. This caught the distinction between Core's bootstrap
types and generated model types; the page now states the Typegen prerequisite.
The application excerpt uses `schemaPolicy: 'fail'`, so its existing-database
caption accurately describes startup behavior. It links to the complete setup
and lifecycle guide instead of presenting the excerpt as a complete project.

Existing public MDX contracts remain accurate; the landing introduces no API or
configuration changes requiring guide edits. The website README now documents
the landing structure, scope, and sample verification prerequisite.

## Verification

- `yarn website:typecheck`: passed.
- `yarn website:lint`: passed without warnings.
- `yarn website:validate`: 58 tests passed, including the exact displayed
  samples and negative checks for selected fields and incorrect result types.
- `yarn website:build`: production build passed, 121 generated pages.
- `yarn website:test`: production build and all 46 browser tests passed,
  including desktop/mobile Project navigation, the native GitHub link, and
  the true black background. Visual and accessibility review caught and
  corrected narrow-screen overflow, low-contrast code comments, and the
  native GitHub SVG's missing accessible name.
- Changed files pass Prettier and `git diff --check`.
- Root framework runtime and PostgreSQL suites were not rerun: no framework or
  database behavior changed. Sample generation does not connect to a database.

Full-page production screenshots were inspected at 1440px and 390px in both
light and dark themes. Additional 320px, 768px, and 1024px captures checked
reflow. Code soft-wraps on narrow screens; the page has no horizontal overflow
at these widths. Axe checks cover WCAG A/AA findings, alongside keyboard tabs,
visible focus, reduced motion, theme switching, internal destinations, the desktop/mobile Project menu, and the
unchanged documentation shell. This is automated and visual QA, not a formal
accessibility certification.

Local review captures (not committed):

- `/tmp/ultimabase-landing-review/desktop-light.png`
- `/tmp/ultimabase-landing-review/desktop-dark.png`
- `/tmp/ultimabase-landing-review/mobile-light.png`
- `/tmp/ultimabase-landing-review/mobile-dark.png`

No push or deployment is part of this handoff.

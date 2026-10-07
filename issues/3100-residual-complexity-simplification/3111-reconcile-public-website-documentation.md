# 3111: Reconcile the affected public website journeys

- Status: completed
- Milestone: 31
- Packages: apps/website; affected package READMEs and examples
- Depends on: 3110
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Audit the public documentation site end to end after the delivered simplifications, including retained candidates.

## Acceptance criteria

- [x] Review apps/website/content/docs using documentation-ownership.json, page sources and the final decision/removal ledger. Include Core/schema, plugin authoring, Hooks, Access, Typegen, PostgreSQL, testing and installation journeys.
- [x] Verify public examples and explanations match delivered code: no removed imports/options, imaginary replacement API, unsupported migration implementation or future registry/package presented as available.
- [x] Check relevant REST/GraphQL and authentication/Soft Delete examples still describe the preserved contract. Their behavior is not new scope for this issue.
- [x] Maintain a linear setup -> declarations -> usage -> lifecycle/testing -> limits journey. Preserve pre-release/unpublished-package guidance and manual/local installation routes.
- [x] Record pages reviewed, edits and justified no-change outcomes. Earlier implementation issues must already have updated affected public pages; repair any missed synchronization with a documented audit finding.
- [x] Verify TypeScript examples against actual built exports/Typegen and executable database/transport flows where applicable. Keep website prose descriptive, never Runtime truth.

## Tests

- [x] Run yarn website:validate, website:typecheck, website:lint and website:build, plus affected browser/accessibility/theme/viewport checks when rendered content changes.
- [x] Run literal-example validation and repository metadata/link/format checks; document any existing unchanged page coverage reused.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

Landing redesign, new product documentation for unimplemented capabilities, deployment, or postponing earlier required docs to this issue.

## Handoff

Documentation impact: both. The public Generate Types, PostgreSQL and Roadmap
pages are reconciled with the delivered contracts; issue/plan/removal records
retain the audit evidence. No package source, public signature or example code
changes. The starting tree at `a190ed96` was clean, 12 local commits ahead of
origin/main, with no remote change to integrate.

### Reviewed journeys

Paths are relative to `apps/website/content/docs/1.0.0`. The ownership map,
page sources and accepted RC-01–06 ledger guide this review:

| Journey / pages                                                                                                                                            | Outcome                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick-start`, `manual-installation`, `reference/package-index`, `project/release-status`                                                                  | Keep the explicit unpublished-package warning, local repository route, Node 24, public package roots and disposable database setup                                                                       |
| `core/application`, `core/data-modeling/schemas`, `core/runtime/runtime-pipeline`, `core/runtime/logical-operations-and-persistence`                       | Keep single initialized realm, pure compilation, application-owned handles, immutable graph and fixed execution/transaction ordering                                                                     |
| `plugins/overview`, `plugins/using-plugins`, `plugins/build-a-plugin/index`, `schemas-and-typegen`, `operations-and-graphql`, `runtime-and-infrastructure` | Keep installation/privilege/ownership boundaries, additive patches and approved opaque-selector semantics; removed stages/markers/migration APIs occur only in explicit retirement prose                 |
| `plugins/official/access`, `hooks`, `roles`, `acl-permissions`, `validation`                                                                               | Preserve optional engines, fail-closed/narrowing policy, Hook ordering and plugin-owned contracts; internal simplifications introduce no new usage                                                       |
| `guides/generate-types`                                                                                                                                    | Replace stale conditional-marker activation wording with registered references consumed by the compiled graph; generation remains before infrastructure and build/typecheck                              |
| `plugins/official/postgresql`, `operations/before-exposing-your-application`                                                                               | Remove the remaining contradictory preparation-claim paragraph; group compatibility guidance with explicit policies after configuration; retain rename/non-destruction and external-tool limits          |
| `guides/test-an-application`, `operations/troubleshooting`                                                                                                 | Preserve suite-level beforeAll/afterAll, awaited cleanup, isolated database schemas per worker, ownership failure diagnostics and separate processes                                                     |
| `plugins/official/http`, `hono-server`, `rest`, `graphql`, `password-authentication`, `soft-delete`                                                        | Preserve setup → usage → lifecycle → limits; signup required fields, login-only credentials, user/session-only wire results, session rotation, tombstone filtering and private Master-only restore/purge |
| `project/roadmap`                                                                                                                                          | Correct the obsolete claim that this pass shipped no public removals; distinguish delivered removals from planned files, caching and migrations without claiming the final audit complete                |

Package READMEs already explain the exact approved changes and require no new
edit. Static schema examples and copied configurations remain accurate. The
website stays descriptive; no generated declaration becomes Runtime truth.

### Audit loop and evidence

1. Whole-journey review found two stale sentences missed by the earlier
   implementation documentation reviews: conditional Typegen activation and
   PostgreSQL preparation claims. Correct them and move the latter compatibility
   note out of the first-time overview. Website content/type/lint/build pass.
2. Review of the public Roadmap found its preparation-time “none has shipped”
   claim obsolete. Replace it with the exact delivered removals and preserved
   capabilities; rerun affected content/build/browser checks.
3. Re-audit the complete documentation diff, package roots, snippets, lifecycle,
   security limits and historical records. No additional contract or scope
   change is needed; the completed validation below clears the commit gate.

Evidence at `/tmp/ultimabase-m31-3111`:

- All 57 documentation pages: 142 TypeScript/JavaScript fences, 193 named
  UltimaBase imports match the 1,705 current built root exports; no removed or
  deep import. This check verifies import availability, not every snippet's
  runtime completeness.
- Six literal schema/configuration journeys (Schemas, Access, Hooks, Password
  Auth, Soft Delete and Generate Types) compile with real Typegen declarations
  against built packages, without connecting infrastructure. The literal
  workflow option/selector/additive-patch example also compiles and materializes
  its field; only its Core compatibility range is adapted to local 0.0.0, as the
  documented prerequisite requires. No authoring API or declaration is replaced.
- Literal Roles/Access, Hono/REST/GraphQL and Auth/Soft Delete examples run on
  disposable PostgreSQL 17. Own-profile isolation, denied/allowed role mutation,
  HTTP application identity, disabled REST writes, GraphQL queries/introspection,
  signup/login/refresh/logout, required signup data, wire result shape and
  tombstone visibility pass. Managed SIGINT disposal and an externally owned
  Hono listener's survival also pass. Harness-only composition supplies the
  documented optional transport plugins; temporary outputs/containers are removed.
- `yarn website:validate`: 66 checks; `website:typecheck`, `website:lint` and
  `website:build` pass. Existing lint warning is unchanged. All 59 browser tests
  pass, plus eight light/dark and 375/1280-pixel combinations on the two corrected
  guides, with no Axe, overflow or client-error findings.

After the Roadmap correction, content/build pass again; all 24 affected
preview/Markdown browser checks and four additional light/dark/mobile/desktop
Roadmap combinations pass. Final metadata, relative links, changed-file
Prettier and `git diff --check` pass. No production source, test or generated
artifact changes; package gates from 3110 remain valid for identical code.

Reviewed scope: `a190ed96` plus this complete nine-file documentation diff.
No unresolved finding or out-of-scope work remains. The dedicated local commit
and exact line counts are reported after commit; then proceed only to 3112.
No push.

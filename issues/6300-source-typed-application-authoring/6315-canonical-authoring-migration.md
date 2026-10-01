# 6315: Publish one canonical authoring journey

- Status: completed
- Milestone: 63
- Packages: repository examples, initializer, READMEs, public website, engineering documentation
- Depends on: 6313
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make every maintained entry point teach the exact approved application and
schema authoring form, with the retained Typegen relationship boundary and no
alternate installation path.

## Acceptance criteria

- [x] Root, package, Core schema/plugin, initializer, minimal example, and public website journeys use chained `UltimaBase.use()`, `App.Schema.define()`, explicit schema roots, and direct class commands.
- [x] No maintained example destructures `Schema` from the configured application or introduces `Schema.use()`.
- [x] Global plugin defaults and local direct schema-option exceptions are demonstrated without plugin maps or repeated per-schema installation.
- [x] Plugin-author guidance uses the same Core-native contract with Plugin Kit presented only as an optional convenience layer.
- [x] Typegen installation, generation, watch, fingerprint, stale-output, and generated-graph documentation accurately describes the retained consumers approved by ADR-0280/0281/0283/0284 and does not claim configured local plugin surfaces require generation.
- [x] Migration notes map every removed pre-release form to exactly one replacement and do not promise compatibility aliases.
- [x] Documentation ownership metadata, source links, initializer snapshots, package archives, and public search content are updated.
- [x] The current architecture index points only to maintained source-typed contracts.
- [x] Documentation impact is recorded.

## Tests

- [x] Initializer generation and runnable packed application E2E.
- [x] Documentation source, code-block, package-index, and removed-vocabulary guards.
- [x] Public website validation.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and enumerate every maintained README, example, initializer template, website owner page, architecture index entry, and searchable removed vocabulary.
- [x] Audit the complete diff for multiple taught forms, inaccurate Typegen/setup commands, invalid code samples, unpublished-package inaccuracies, broken links, missing sources metadata, initializer drift, and documentation that claims undelivered behavior.
- [x] Record each finding and correction in the handoff; rerun affected runnable examples, website/initializer checks, link audits, and the complete documentation audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; documentation-only edits do not waive product examples, packaging, or `yarn validate:full`.
- [x] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Publishing packages or deploying the website.
- A second beginner API distinct from the canonical API.
- New product features in examples.

## Baseline and inventory

Revision `9c3c360a`; clean working tree after 6313's committed-diff review.
Remote origin/main has no divergence; 18 local commits remain unpushed.
Retained Typegen dependencies follow ADR-0280/0281/0283/0284 and 6313's
consumer inventory, not the older relationships-only wording of this issue.
The corresponding acceptance criterion is reconciled with those accepted
decisions; this is not a claim that the original relationships-only target was
achieved. Issue 6316 must assess the actual remaining generated surface.

- Root README: the introductory schema precedes the configured factory and the
  prose still describes explicit application selection. Align the ordinary
  journey without teaching another plugin installation path.
- ARCHITECTURE.md, Core README, current-architecture index: qualify configured
  source inference versus retained callbacks, where, User and advanced consumers;
  index the accepted refinements instead of promising later blanket removal.
- Package READMEs, Core schema/plugin examples, docs/concepts and public MDX:
  search for removed standalone Schema.define, Schema.use, constructor plugins,
  destructuring and required application.schemas access. Preserve historical
  ADRs/plans/issues. The initial search found no surviving removed code form.
- Initializer: base-template already shares one configured factory and uses
  direct commands. security-template still declares PasswordUserSchema without
  SchemaApplication.Schema; migrate it to the accepted 6319 form, matching Roles.
  Protect both TypeScript and JavaScript generated outputs and packed projects.
- Minimal and Todo examples: executable schemas/commands are already migrated.
  Minimal README still calls its direct class command an application handle.
  Both tracked Typegen declarations were regenerated and validated by 6313.
- Public ownership map: core-application, project-initializer and
  plugin-authoring-and-tooling cover this work. Using Plugins incorrectly tells
  readers to regenerate for missing field Hooks/Validation; correct the
  configured-factory diagnosis and provide one removed-form migration mapping.
- Existing active-contract documentation guards scan Markdown code blocks;
  add a focused canonical-form guard including MDX without changing historical
  documents or weakening the existing ownership/link checks.
- Search content comes from the same MDX; no separate generated search copy or
  deployment is needed. Package inventories and dependency directions do not
  change. Verify source links/ownership metadata through website validation.

## Audit iterations

| Iteration | Finding and correction                                                                                                                                                                                                                                                                                                                                                                                                                       | Validation                                                                                                                                                                                                                                                       | Remaining work                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1         | Root example and generated User starter did not teach the same configured entry point. Rewrote one complete root example with global Soft Delete defaults and a local exception, and passed SchemaApplication.Schema to PasswordUserSchema.define. Added Markdown/MDX removed-form guards and a public-export typecheck of the exact root block.                                                                                             | Initializer unit suite: six files/44 tests. First README canaries exposed missing Node ambient types in the new test harness; explicit Node compiler settings resolve the harness issue without product changes. Final documentation canary: two files/10 tests. | Packed starter, website and full gates.                |
| 2         | Package-local API/security E2E fixtures linked node_modules relative to cwd, causing ten missing-package failures unrelated to the new User form. Resolve both links from import.meta.dirname and rerun the same package-local command. Core/schema, plugin-author and public guides also overstated Typegen removal or told readers to regenerate for source-owned options; corrected those boundaries and indexed ADR-0280/0282/0283/0284. | Root typecheck and focused lint pass; website 17 files/66 tests pass.                                                                                                                                                                                            | Package-local integration rerun and full gate pending. |

Documentation impact: both. Root/package/Core/example contracts and the
architecture index now agree with the public schema and plugin-consumption
guides. The initializer's User form is documented in its README. Existing
ownership mappings already include all changed areas; page-level sources were
updated where needed. No package is published and no website is deployed.

The two test-fixture path corrections exceed the original prose/template edit,
but are required to make the package's advertised integration command actually
test the generated application. They change no product behavior or exclusion.

The corrected package-local built integration command passes three files /
16 tests, including generated JS/TS applications, HTTP, PostgreSQL and packed
initializer selections. The full gate passes in
`/private/tmp/ultimabase-6315-validation.log`.
There is one production-line replacement and no new Runtime implementation.

The inventory covers all 27 root/package/example READMEs returned by
`git ls-files README.md 'packages/*/README.md' 'examples/*/README.md'`, plus the
website README, 16 Core example files and 57 public MDX pages. Canonical syntax
guards scan all maintained Markdown/MDX code blocks; existing website checks
retain source, package-index, link and ownership validation. Historical ADRs,
plans and completed issues remain historical rather than being rewritten.

### Final audit: iteration 3

The complete diff has no unresolved finding. The accepted retained Typegen
boundary replaces the issue's outdated relationships-only wording explicitly;
historical decisions are unchanged. No capability, test, assertion, coverage
exclusion or threshold was removed. No public export or dependency was added.

`yarn validate:full` passes: 557 ordinary files/2,654 tests (267.54 seconds),
636 coverage files/2,916 tests (461.89 seconds), issue metadata 1 file/9 tests,
and website 17 files/66 tests. Formatting, typecheck, lint, package builds,
export checks and dependency constraints pass. Narrow starter E2E passes
3 files/16 tests; the exact README public-export canary and canonical Markdown/
MDX guards pass. The final handoff-only edits rerun formatting and metadata.

Coverage compared with 6313:

| Metric     | 6313          | 6315          | Percentage |
| ---------- | ------------- | ------------- | ---------- |
| Statements | 23,787/26,145 | 23,788/26,145 | 90.98%     |
| Branches   | 14,689/17,381 | 14,690/17,381 | 84.51%     |
| Functions  | 4,998/5,201   | 4,998/5,201   | 96.09%     |
| Lines      | 23,063/25,191 | 23,064/25,191 | 91.55%     |

There is no coverage regression. Repository measurement remains 126,406
production lines, 70,243 Core lines, 1,739 public exports and 939,040 declaration
bytes. Test/support lines increase by 60 to 136,861. The single production-line
replacement aligns the User starter; all remaining work is tests/documentation.
These are intermediate results, not evidence that the final milestone's
complexity ceilings pass. Issue 6316 owns that comparison. No push is authorized.

Final diff categories (physical added/deleted lines, including this handoff):
production +1/-1; tests +70/-10; documentation/plans +279/-119.
Total +350/-130 (net +220) across 18 files; no generated artifact changes.

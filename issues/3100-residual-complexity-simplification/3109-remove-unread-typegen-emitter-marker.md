# 3109: Remove the Typegen emitter marker if approved

- Status: completed
- Milestone: 31
- Packages: @ultimabase/core, @ultimabase/typegen; affected conformance/docs
- Depends on: 3108
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0265](../../docs/adr/0265-remove-typegen-emitter-marker.md), accepted 2026-09-21

## Goal

Remove the exact emitter-marker protocol without changing automatic Typegen generation.

## Acceptance criteria

- [x] Require the accepted RC-05 decision, including uniqueness/inspection/requirement/conditional-privilege deltas and the identified engineering fixture adaptations. Remove the token/interface, inert provider, exclusive exports and marker-only tests.
- [x] Preserve generic conditional privilege/facade/denial checks using existing generic fixtures. Workflow/value proofs request their existing type references directly; do not rename the emitter marker as test infrastructure.
- [x] Keep Typegen setup timing before infrastructure, automatic file generation, deterministic fingerprints/output, consumed public type references and JavaScript operation without Typegen.
- [x] Retain generic plugin identity and capability conflict checks for all remaining protocols. Do not add a replacement emitter registry merely to preserve the removed convention.
- [x] Compare generated declarations and editor inference against baseline source and packed applications, including initializer-generated TypeScript and JavaScript projects.
- [x] Update plugin-authoring/Typegen website guidance, package READMEs and exact removal history in the same issue.

## Tests

- [x] Run Typegen lifecycle, output/fingerprint, language-service, source/built/packed export and initializer checks.
- [x] Run the implementation gates, relevant conformance and coverage comparisons; verify absence of effects before privilege checks.

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

Removing Typegen, changing generated runtime truth, adding a public emitter selection mechanism or altering remaining capability cardinality.

## Handoff

Documentation impact: both. Core and Typegen READMEs plus the public
Generate Types and Schemas and Typegen guides describe direct generation and
reference declaration without the marker. The plugin-authoring Start Here
page already directs authors to `typegen:reference` and stays accurate.

Starting revision: `86a629a7`. Remove only the marker token/interface, both
barrels, Typegen's inert provider/capability tuple and their fixture consumers.
Workflow/value references now request their existing privilege directly;
the three conformance support plugins no longer publish a fake emitter.
No generator, snapshot, fingerprint, writer, loader or initializer code changes.
No replacement marker, selection registry, dependency or public option appears.

Production delta: **-42 lines** (Core -25, Typegen -17). All 23 package roots
expose 1,719 names, exactly two fewer than 3108. Only Core and Typegen built
declarations change, exclusively for the removed marker and provider tuple;
the other 21 are byte-identical. Declaration size decreases by 709 bytes to
854,388. No generated artifact or format version changes.

The reference test now checks owner-scoped registration without a generator
and direct privilege denial. Existing generic conditional-facade, conflict,
requirement and privilege tests stay unchanged. Negative source/packed type
checks reject both removed names. Typegen tests preserve filesystem-claim
denial, reject duplicate official plugin identities and verify the generated
file exists before an earlier plugin enters its connection phase.

### Audit loop

| Pass | Finding / correction                                                                             | Verification                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Exact marker removal and direct-reference fixture adaptation                                     | 22 focused tests, root typecheck/build, root lint and constraints pass; the duplicate assertion uses the existing PLUGIN_DUPLICATE code    |
| 2    | Strengthen the concrete startup-order proof; use the existing hooks.connect declaration boundary | Five Typegen plugin tests pass; final test typecheck and targeted ESLint pass; generation precedes connection without any emitter protocol |

The initial full source run lacked sandbox permission for local HTTP listeners;
it was rerun with the required network/browser/Docker permissions, without
changing test expectations. Local evidence: `/tmp/ultimabase-m31-3109`.

Final validation and audit:

- `yarn typecheck`, `yarn build`, root `yarn lint`, final test typechecking and
  targeted ESLint, and `yarn constraints` pass. Existing file-size warnings
  remain; no lint error or baseline relaxation.
- `yarn test --maxWorkers=2`: **2,550 tests / 529 files**, no type errors.
  The final strengthened startup case also passes its focused run and full
  coverage run after correcting its fixture to the existing `hooks.connect` API.
- `yarn test:e2e:built --maxWorkers=2`: **384 tests / 98 files**, including
  Core packed negative exports, Typegen generated/committed declarations,
  source/built language-service contracts, initializer TS/JS projects,
  alternative policy/Hooks engines, PostgreSQL and Password Auth.
- `yarn test:coverage`: **2,794 tests / 604 files**. Statements 90.58%, branches
  84.02%, functions 95.91%, lines 91.18%; all unchanged thresholds pass.
  Comparison with 3108 covers 682 identical instrumented maps and 121 retained
  locations in two changed files, with no regression. The four unmapped entries
  are exclusively the removed marker definition/composer/provider.
- Website content validation: 66 checks; website build passes. The final copy
  keeps emitter retirement details in the plugin-authoring guide and focuses
  the application guide on setup and the existing duplicate-identity error.
- Backlog/active-contract tests: 14 pass. Final relative links, changed-file
  formatting and `git diff --check` complete the documentation gate.

The final complete diff audit reconciles the exact two-name export delta,
provider tuple, direct-reference fixture convention, retained generic kernel,
coverage, documentation and unchanged generated artifacts. No finding remains.
Tests/support changes by +65 / -70 = -5 lines; production by +2 / -44 = -42.
Current production is 123,913 lines / Core 65,881; tests/support 130,923 and
unchanged tooling 2,119. No performance or CI claim is made.

Reviewed scope: `86a629a7` plus the entire issue diff and handoff records.
No work exceeds ADR-0265/3109. The dedicated local commit is reported outside
its own contents; only then may 3110 start. No push.

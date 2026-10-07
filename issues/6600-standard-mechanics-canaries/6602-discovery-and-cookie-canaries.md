# 6602: Test file crawling and cookie-route simplification

- Status: completed
- Milestone: 66
- Packages: password-auth-plugin, website, repository tooling
- Depends on: 6601
- ADR: 0235, 0236, 0268, 0275

## Goal

Test the user-approved fdir replacement first, then remove duplicated internal
Password Auth cookie response construction. Retain only worthwhile simplification
with existing capabilities, diagnostics, security and behavior intact.

## Working context

- Scope: existing recursive documentation/file walkers and Password Auth cookie routes only. No new public API, generic route framework, Core or Typegen changes.
- Current contracts: Password Auth README; ADR-0235/0236/0268 cookie and session boundaries; current documentation guards; ADR-0275 validation.
- Locked decisions: preserve file inventory, hidden paths, symlinks, errors and ordering; preserve all six operations, strict input snapshots, token privacy, cookie attributes and error mapping. Count adapters and direct dependencies, not gross deletions.
- Rejected approaches: native glob/recursive readdir remain rejected in 6601. fdir is a distinct trial because its public API offers error propagation and explicit symlink handling. No prior cookie-route experiment.
- Proof commands: discovery parity canary and website content checks; cookie characterization on the original implementation, then focused unit and source/compiled PostgreSQL HTTP suites; permissioned yarn validate:full before retention/commit.
- Exploration budget: two comparable failures or 30 minutes without verifiable progress per candidate, excluding validation waiting.
- Next action: none; both trials are audited, the cookie simplification passes full validation and rebuilt consumers. Inspect the dedicated local commit before handoff; no push authorized.

## Canary evidence

- fdir 6.5.0 finds the same 57 real documentation files with hidden paths retained,
  includes file/dangling links without traversing directory links, and preserves
  ENOENT/ENOTDIR with `withErrors()`. It does not preserve the current recursive
  result ordering on any of three actual walkers or the boundary fixture.
- Preserving the existing depth-first/Dirent order would add reconstruction code;
  plain sorting is a behavior change, not an exact replacement. Reject this small
  tooling-only replacement rather than add a discovery adapter/dependency.
  No consumer or manifest was changed. Reopen only with a smaller ordering-preserving
  implementation or explicit approval to normalize discovery order.
- The canary extracts the actual current functions using the TypeScript AST, not
  rewritten substitutes. Raw evidence and baseline coverage are under
  `/private/tmp/ultimabase-discovery-cookie.1Tn3jv`.
- Cookie characterization: the original implementation passes all five source
  HTTP/PostgreSQL tests with new malformed sign-up/login/password-change input,
  safe success fields, error request IDs and no error/password-change cookie.
  The refactor passes the same suite, plus refresh with a malformed body that it
  must ignore. All 58 Password Auth unit tests and root typecheck pass.
- Retained implementation: one private POST/protocol/error wrapper and one
  authentication response path for sign-up/login/refresh. Preserve all original
  operation tokens/bindings, endpoint order, input/result snapshots, cookie
  serializers and session/CSRF resolver. Production: 65 added / 96 removed,
  net -31. No new dependency/export; the wrapper stays inside Password Auth.
- Focused lint found Vitest's any-returning string matcher assigned into an
  object literal in the new assertions. Store the matcher as unknown; no lint
  suppression or public type widening. The original file already warns above
  600 test lines; the expanded suite remains below the 700-line hard limit.
- Reviewed Password Auth README, website ownership and cookie guide: all six
  paths, same success/error bodies, session behavior and security descriptions
  remain accurate. No public/package contract or ADR change is needed.

## Final audit and validation

- `yarn validate:full`: exit 0. Ordinary suites: 560 files / 2,683 tests;
  coverage suites: 639 files / 2,947 tests; no type errors. Issue checks:
  22 tests; website checks: 66 tests. Formatting, lint, builds, public export
  checks and dependency constraints pass. Existing line-budget warnings remain;
  there is no new warning category or exception.
- `yarn vitest run --project coverage-postgres-e2e --maxWorkers 1
packages/password-auth-plugin/tests/e2e/password-http-sessions.postgres.e2e.test.ts`:
  all five source checks pass before/after. The same file with
  `--project postgres-e2e` passes all five against rebuilt packages.
  Docker/listener permissions were requested from the first run.
- Focused Password Auth unit checks: 14 files / 58 tests pass. Root
  `yarn typecheck`, focused ESLint and three website guard files (17 tests) pass.
  Full validation follows the focused lint correction recorded above.
- Coverage across the same 729 production files: statements 23,783/26,074 =
  91.21%; branches 14,704/17,360 = 84.70%; functions 5,013/5,193 = 96.53%;
  lines 23,059/25,128 = 91.76%. Before: 91.17%, 84.65%, 96.51%, 91.72%.
  Thresholds and exclusions are unchanged. Comparing individual covered
  statement/function/branch locations finds zero regressions in unchanged files.
- Production TypeScript: 65 added / 96 removed, net -31. Test TypeScript:
  31 added / 0 removed, net +31. Total TypeScript: net zero. Tracking/documentation
  grows separately; this is not a net repository line reduction.
- Audit: one private route wrapper replaces repeated protocol/error setup;
  sign-up/login/refresh share the original safe response construction. All six
  endpoint identities/order, canonical operations/bindings, snapshots, error
  codes/statuses, request context, cookies and credential ownership remain.
  No Core, Runtime, Typegen, public export or dependency change. No remaining
  finding; the final local commit must be inspected before handoff.
- Further work: normalizing discovery order could reopen fdir, but needs approval
  and a new net-complexity proof. Do not extend this small cookie wrapper into a
  generic transport framework.

## Documentation impact

Internal engineering documentation. No public contract change is planned; review
Password Auth cookie documentation against the retained implementation.

## Acceptance criteria

- [x] Prove or reject fdir on real consumers and file-boundary fixtures.
- [x] Characterize cookie success/error/privacy behavior before refactoring.
- [x] Remove rejected experiments; record net lines and dependency cost.
- [x] Audit retained changes and pass full validation before the dedicated local commit.

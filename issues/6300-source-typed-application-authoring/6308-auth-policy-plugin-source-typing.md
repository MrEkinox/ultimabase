# 6308: Migrate ACL, Roles, and Password Auth source typing

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/password-auth-plugin`
- Depends on: 6307
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate the identity and monotonic-policy vertical to source typing while
preserving its exact security boundaries, owned schemas, operations, model
surfaces, and transport-neutral behavior.

## Acceptance criteria

- [x] ACL retains exact schema options, field permissions, pointer/role subjects, AND-only protected constraints, Master bypass, and independence from Access.
- [x] Roles retains its plugin-owned schema, hierarchy and membership invariants, request-subject contribution, direct commands, and absence of authority grants by itself.
- [x] Password Auth retains its owned User and session schemas, password hashing, sign-up/login/refresh/logout/logout-all behavior, request authentication, session lifecycle, direct User-class methods, and transport-neutral operations.
- [x] Source types infer exact plugin-owned policy options, static-method inputs, model commands, and operations without generated plugin declarations; owned-schema relationships and the approved exact User-result exception use the retained Typegen graph.
- [x] Multiple explicit instances, dependency and peer checks, provider composition, plugin absence, ownership conflicts, privilege timing, and focused diagnostics remain exact.
- [x] No authentication input, role membership, shaped context, or foreign credential manufactures Core authority.
- [x] Superseded package-specific Typegen declarations and compatibility branches are absent; global generated operation-registry/reference pruning remains issue 6313's explicit scope.
- [x] Package READMEs, examples, security documentation, and public documentation are reviewed or updated as required by the public change.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing unit, type, editor, security, HTTP integration, session, and PostgreSQL suites migrate without dropped assertions.
- [x] Source and packed applications cover presence, absence, provider composition, direct User methods, and adversarial authority cases without generated plugin-surface declarations.
- [x] Locked TypeScript performance and memory budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every policy, owned-schema, operation, direct-command, transport, credential, session, and security contract in the three packages.
- [x] Audit the complete diff for widened access, authority manufacture, ACL/Access coupling, role semantic drift, password/session regressions, ownership leaks, private Core access, per-plugin bridges, stale Typegen, missing packed/source assertions, and postponed documentation.
- [x] Record each finding and correction in the handoff; rerun affected security and identity verticals plus the complete cross-plugin audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; security behavior may not be weakened to fit the new type projection.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Redesigning authentication, ACL, or role semantics.
- Adding authentication providers or transports.
- Making Roles or authentication a Core authority mode.

## Starting inventory

- Starting revision: `401e433c`; the working tree was clean. Issue 6307's
  complete validation baseline is 557 ordinary files/2,629 tests and 635
  coverage files/2,886 tests, with 90.85/84.35/96.03/91.42 coverage.
- ACL's configured schema option, reserved field, field value, and protected
  policy remain source-owned after issue 6307. Its immutable value, subject
  resolution, monotonic constraints, input preparation, reference cleanup,
  committed events, Access independence, and PostgreSQL suites are retained.
- Roles' configured specialized schema, custom fields, static references, and
  persisted membership/hierarchy commands already have source contracts. Its
  nominal option, resolver, audited internal authority, deletion policy,
  events, Access integration, and PostgreSQL suite are retained.
- Password Auth's User-class methods and six nominal operation tokens have
  source contracts, but the manually declared plugin result currently erases
  the operation projections derived from its six installed handlers. Its
  custom/default User ownership, private credentials and sessions, Master
  audit, profile-read rollback, HTTP Bearer/cookie and REST/GraphQL tests are
  retained. The generated application operation registry is inspected before
  any removal; issue 6313 owns global Typegen-output pruning.
- Existing source and packed editor checks, plugin conformance, operation and
  session unit suites, adversarial HTTP/auth tests, and PostgreSQL verticals
  form the regression inventory. Public docs are located through
  `apps/website/content/documentation-ownership.json` before publication.

## Architecture checkpoint

| Iteration | Finding or evidence                                                                                                                                                                                                                                                                                          | Correction or decision                                                                                                                   | Validation result                                                                                                                                   | Remaining findings                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Installed Password Auth operation names lost their exact input/result through the plugin's manual return annotation.                                                                                                                                                                                         | Derive each source operation receipt from the existing installed handlers; retain the public operation definitions and Runtime behavior. | Focused source and packed editor checks, 34 policy/auth test files and 158 tests passed.                                                            | Full diff audit and completed-issue gate remain open.                                                                                                                        |
| 2         | A configured `PasswordUserSchema.define(Base.Schema, ...)` overload typed source options and sign-up input, but the direct `User.findMany()` result lost even a local required `displayName`. Two bounded attempts to carry the exact User result through `SchemaReference` also hit model/pointer variance. | Removed the experimental overload, its examples and tests. Do not add another adapter around the same nominal model contract.            | The exact-result canary failed; the earlier complete `yarn validate:full` passed before this audit finding and is therefore not a final green gate. | Architecture decision: retain generated User result typing within the existing schema graph, or revise the Core model-reference type contract in a separate approved design. |

The rejected custom-User declaration is not represented as delivered. No
Runtime or security semantics were changed. The user approved retaining exact
User result typing in the existing Typegen graph, while class-method inputs
and installed application operation handles infer from source. Issue 6316
records this exception, its generated declaration cost, and the possibility of
a later Core model-reference type redesign. No second registry or replacement
Typegen bridge was introduced.

## Completion audit

| Iteration | Finding or evidence                                                                                                                                                                                                                                        | Correction or decision                                                                                                                                             | Validation result                                                                                                     | Remaining findings |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 3         | Core intentionally accepts dynamic operation names even when a plugin is absent, so a type-error-on-name canary was invalid.                                                                                                                               | Assert instead that the uninstalled handle lacks the precise login result and that Runtime rejects the unknown name; retain the exact installed source projection. | Source and packed language-service fixtures and the runtime absence test pass.                                        | None.              |
| 4         | The final diff changes only a type-level projection, focused assertions, documentation, and milestone evidence. ACL/Roles behavior, Password Auth hashing, storage, sessions, transports, authorization, privilege timing, and Runtime code are unchanged. | Keep the existing operation Typegen references while the generated registry consumes them; issue 6313 owns its global output audit and pruning.                    | Full `yarn validate:full` passed; the locked benchmark also passed in three isolated samples per 1/10/50-schema form. | None.              |

Final `yarn validate:full` passed: 557 ordinary files/2,631 tests; 635 coverage
files/2,888 tests; website 17 files/66 tests. Coverage was 90.85% statements
(23,875/26,278), 84.36% branches (14,760/17,496), 96.03% functions
(5,020/5,227), and 91.42% lines (23,149/25,320), with no percentage below
the issue-6307 baseline. Format, typecheck, lint (zero errors), build, issue
metadata, dependency constraints, and public documentation checks passed. The
raw performance samples and old/current comparisons are in
[`evidence/6308-auth-policy-benchmark.md`](evidence/6308-auth-policy-benchmark.md).

Documentation impact: `both`. The Password Auth README and public page now
explain source-typed operation handles and the retained Typegen dependency for
exact returned User fields. ACL and Roles public contracts were reviewed and
remain accurate because neither package's behavior or public signature changed
in this issue. No implementation exceeds the refined acceptance criteria.

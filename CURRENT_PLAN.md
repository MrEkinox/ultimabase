# Current plan: Source-typed application authoring

- Status: planned
- Milestone: 63
- Baseline: `3c130475`
- Completed issues: none
- Active issue: none
- Next issue: 6301

Replace generated application authoring with the user-approved configured
application factory and source-typed schema contract. The exact target is
frozen in the
[DX contract](docs/plans/2026-09-28-source-typed-application-authoring-target.md):
plugins install only through `UltimaBase.use()`, schemas retain the current
`App.Schema.define({ className, fields, ... })` form, registration stays
explicit, direct class commands resolve the sole active application, and
Typegen is removed after full parity is proven.

The current logical `pg-vector` field remains source typed only on factories
that install `pgVectorPlugin()`. Milestone 63 does not add physical PostgreSQL
vector persistence; its proof covers conditional builder presence, inference,
hover, diagnostics, and static compilation only.

Issue 6301 is a mandatory evidence gate. It locks compiler, language-service,
memory, hover, diagnostic, and complexity budgets before any production public
API migration. If the proof requires another installation path, a permanent
bridge, duplicated plugin contracts, capability loss, or unacceptable
TypeScript cost, stop for architecture review.

Issues 6301–6316 run sequentially with one dedicated commit and complete
`yarn validate:full` evidence per issue. The milestone ends with an exact
old-versus-new audit of DX, capabilities, lines, exports, declarations,
TypeScript cost, Runtime cost, tests, and coverage.

Every issue must execute the saved mandatory loop: baseline, scoped
implementation, focused validation, `yarn validate:full`, complete diff audit,
correction, invalidated validation, complete re-audit, and zero findings before
its dedicated commit. Any failed, skipped, interrupted, flaky, or unavailable
required test keeps the issue `in-progress`; passing tests alone never replaces
the audit. Inspect the committed diff and amend the unpushed issue commit if a
post-commit finding appears. Do not advance or push with an unresolved finding.

The final issue-6316 milestone audit must include the complete one-file
developer form and compare it with the saved target so any syntax or capability
divergence is visible before milestone acceptance.

No implementation issue has started. No push of future milestone work is
authorized.

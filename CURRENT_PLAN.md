# Current plan: Runtime and resource simplification

- Status: in-progress
- Milestone: 41
- Baseline: `38b1ca57`
- Current issue: 4107 (architecture checkpoint)

The user authorized a repository-wide debt and DX reduction sequence on
2026-09-26 while retaining every functional capability.

Issue 4101 consolidated active-or-explicit application selection for single
operations, batches, and static schema mutations with 32 fewer production
lines. Issue 4102 removed the parallel mutation/transaction switches and
centralized only genuinely identical Runtime operation characteristics with 13
fewer production lines. Issue 4103 consolidated 13 exact enumerable-key loops
without changing symbol or property semantics and with 3 fewer production
lines. Issue 4104 added native asynchronous disposal to PostgreSQL test
resources and reduced lexical cleanup boilerplate by 5 test lines. Issue 4105
aligned captured-call mechanics in schema builders with 12 fewer production
lines. Issue 4106 made root and nested Query builders share one canonical
clause serializer and removed a `WhereBuilder` AST round trip with 34 fewer
production lines. Issue 4107 now audits PostgreSQL targeted mutation planning
and proceeds only if adapter, transaction, protected-policy, and prepared-plan
boundaries stay unchanged.

No push is authorized.

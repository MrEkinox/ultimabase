# ADR-0064: Mandatory deterministic Runtime pipeline

- Status: superseded
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0015, ADR-0063
- Superseded by: ADR-0090

## Decision

`@ultimabase/runtime` owns one `RuntimePipeline` class with the following fixed
order:

```text
normalization
→ structural validation
→ CLP
→ ACL
→ field permissions
→ global before-hooks
→ schema before-hooks
→ database operation
→ schema after-hooks
→ global after-hooks
→ commit
→ post-commit events
```

Application assembly must provide all twelve stages. Capabilities that are not
installed use an explicit neutral implementation rather than removing their
stage. The constructor checks this invariant for JavaScript callers before an
operation begins.

Each stage has a narrow generic function contract. Normalization, structural
validation, and before-hooks may return an operation of the same exact type.
CLP may allow or throw. ACL contributes portable access constraints. Field
permissions may narrow the operation and append constraints. After-hooks may
replace the operation-specific result. Commit and post-commit stages perform
effects without replacing that result.

The pipeline creates immutable shallow envelopes around the existing context,
Operation AST, and result. It copies and freezes access-constraint collections
at plugin boundaries without rebuilding the immutable AST or result values.
`RequestContext` authority cannot be replaced by a stage output.

The pipeline does not catch and wrap stage failures. A `FrameworkError` keeps
its identity, stable code, public payload, cause, and diagnostics. Execution
stops at the failing stage, so after-hook failures prevent commit and commit
failures prevent post-commit delivery.

## Consequences

REST, GraphQL, jobs, direct TypeScript calls, and tests can share one observable
execution order when the future engines bind them to this pipeline. Permission
plugins and hook registries provide composite stage functions without importing
database implementations.

The pipeline defines orchestration only. Concrete validation, permission,
hooks, transaction ownership, and event delivery remain in their dedicated
issues and plugins. An explicit neutral stage is auditable configuration, not
evidence that its capability was installed.

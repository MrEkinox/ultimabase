# Implementation issues

This directory is the implementation backlog. Each Markdown file is intentionally small enough to assign to one agent.

When a cross-milestone objective is active, its exact resume order lives in
`CURRENT_PLAN.md` at the repository root. Milestone numbers describe
architectural areas; an explicit vertical plan may schedule independent areas
in a different order without changing package dependency direction.

## Status

- `planned`: valid work retained in the backlog but not ready to start.
- `ready`: dependencies are satisfied and work may start.
- `in-progress`: an agent is actively working on it.
- `completed`: acceptance criteria and tests were implemented and verified.
- `merged`: the work and acceptance criteria were deliberately delivered by
  another issue. A merged issue is historical and is not an independent
  implementation.
- `superseded`: a later accepted decision replaced the issue before its
  original acceptance criteria were implemented.
- `deferred`: valid work was explicitly moved out of the active milestone
  without being superseded.
- `blocked`: an external decision or condition prevents progress.

Agents should update status only when they are actually doing the work. Do not
mark dependency issues completed implicitly.

`done`, `complete`, and status strings such as `merged into 1501` are not valid
aliases. Historical completion uses `completed`. A merged issue uses two
separate fields so tooling can distinguish state from target:

```md
- Status: merged
- Merged into: 1501
```

The target must be an existing issue and must also appear in `Depends on`.
Merged and superseded issue bodies remain intact as historical records.

## Metadata contract

Issue IDs come from the numeric filename prefix and are unique repository-wide.
Every issue declares `Status`, `Milestone`, and `Depends on` near the top of the
file. Dependencies use `none` or a comma-and-space separated list of existing
numeric issue IDs. Self-dependencies and malformed lists are invalid.

An issue's numeric milestone must reference an existing milestone `README.md`.
It may differ from the containing architectural-area directory when an explicit
cross-milestone objective scheduled that work. Milestone 7 uses the historical
`7+` label. The sole `future` exception is reserved for an explicitly `deferred`
issue; it does not create a synthetic milestone.

Milestone READMEs use `planned`, `in-progress`, `completed`, or `blocked`.
`completed` milestones may contain only terminal `completed`, `merged`, or
`superseded` issues. This keeps milestone and child completion vocabulary
consistent without rewriting historical issue prose.

## Milestones

- [`000-repository/`](000-repository/README.md)
- [`100-schema/`](100-schema/README.md)
- [`200-core/`](200-core/README.md)
- [`300-query-runtime/`](300-query-runtime/README.md)
- [`400-access/`](400-access/README.md)
- [`500-postgres/`](500-postgres/README.md)
- [`600-transports/`](600-transports/README.md)
- [`700-extensions/`](700-extensions/README.md)
- [`800-generated-types/`](800-generated-types/README.md)
- [`900-mutation-projections/`](900-mutation-projections/README.md)
- [`1000-singular-id-aliases/`](1000-singular-id-aliases/README.md)
- [`1100-typegen-package/`](1100-typegen-package/README.md)
- [`1200-maintenance-consolidation/`](1200-maintenance-consolidation/README.md)
- [`1300-query-enforcement-consolidation/`](1300-query-enforcement-consolidation/README.md)
- [`1400-open-plugin-kernel/`](1400-open-plugin-kernel/README.md)
- [`1500-optional-hooks-access/`](1500-optional-hooks-access/README.md)
- [`1600-kernel-security-release-hardening/`](1600-kernel-security-release-hardening/README.md)
- [`1700-validation-interoperability/`](1700-validation-interoperability/README.md)
- [`1800-single-acl-plugin/`](1800-single-acl-plugin/README.md)
- [`1900-direct-plugin-schema-configuration/`](1900-direct-plugin-schema-configuration/README.md)
- [`2000-standard-schema-field-validation/`](2000-standard-schema-field-validation/README.md)
- [`2100-single-pass-field-validation/`](2100-single-pass-field-validation/README.md)
- [`2200-optional-validation-plugin/`](2200-optional-validation-plugin/README.md)
- [`2300-http-rest-password-auth/`](2300-http-rest-password-auth/README.md)
- [`2400-nested-writes/`](2400-nested-writes/README.md)
- [`2500-contextual-fields-virtual-results/`](2500-contextual-fields-virtual-results/README.md)
- [`2600-plugin-schema-mutations-soft-delete/`](2600-plugin-schema-mutations-soft-delete/README.md)
- [`2700-contextual-relation-filters/`](2700-contextual-relation-filters/README.md)
- [`2800-public-website-documentation/`](2800-public-website-documentation/README.md)
- [`2900-interactive-project-initializer/`](2900-interactive-project-initializer/README.md)
- [`3000-pre-feature-architecture-simplification/`](3000-pre-feature-architecture-simplification/README.md)
- [`3100-residual-complexity-simplification/`](3100-residual-complexity-simplification/README.md)
- [`3200-file-line-budget-remediation/`](3200-file-line-budget-remediation/README.md)
- [`3300-core-plugin-authoring-simplification/`](3300-core-plugin-authoring-simplification/README.md)

## Assignment prompt

An issue may be assigned with a short instruction such as:

```text
Implement issues/100-schema/104-string-field.md.
Read AGENTS.md and all referenced ADRs first.
```

## Issue rules

- Keep one primary feature per issue.
- Honor `Depends on`.
- Implement acceptance criteria, tests, and documentation together.
- Add a new issue when discovered work is independently valuable.
- Update ADRs only when a durable decision changes.

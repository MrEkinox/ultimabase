# Implementation issues

This directory is the implementation backlog. Each Markdown file is intentionally small enough to assign to one agent.

The active cross-milestone objective and exact resume order live in
[`CURRENT_PLAN.md`](../CURRENT_PLAN.md). Milestone numbers describe architectural
areas; an explicit vertical plan may schedule independent areas in a different
order without changing package dependency direction.

## Status

- `ready`: dependencies are satisfied and work may start.
- `planned`: valid work, but dependencies are not yet complete.
- `in-progress`: an agent is actively working on it.
- `done`: acceptance criteria and tests are complete.
- `blocked`: an external decision or condition prevents progress.

Agents should update status only when they are actually doing the work. Do not mark dependency issues done implicitly.

## Milestones

- [`000-repository/`](000-repository/README.md)
- [`100-schema/`](100-schema/README.md)
- [`200-core/`](200-core/README.md)
- [`300-query-runtime/`](300-query-runtime/README.md)
- [`400-access/`](400-access/README.md)
- [`500-postgres/`](500-postgres/README.md)
- [`600-transports/`](600-transports/README.md)
- [`700-extensions/`](700-extensions/README.md)

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

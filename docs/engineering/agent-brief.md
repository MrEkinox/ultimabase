# Agent brief

The working rules a coordinator gives to every implementation or investigation agent, on top of
[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md). The coordinator links this file in each agent prompt
instead of restating it.

## Scope and reading

- Read `AGENTS.md`, `CLAUDE.md`, then only the ADRs and files the task names, starting from the
  [architecture index](../current-architecture.md). Do not explore beyond what the task needs.
- Work only in the worktree and branch the task gives. Never push, merge, touch other worktrees or branches, or change
  GitHub state. Never use unscoped `pkill` or `killall`; stop processes you start by their own PID.

## Changes

- Tests first: commit `wip(<scope>): failing tests …` before the change. Every bug fix gets a regression test.
- No `any`, no new casts, no inline disables. Core never knows a plugin.
- Public contracts change only through an accepted ADR. If the task needs more, stop and report the options.
- UltimaBase is not released: convert every call site and remove the old form in the same change; no aliases,
  deprecations or migration notes.
- Schemas use `App.Schema.define({ className, fields, indexes, …features })` then `.with({ … })`.
- The website is the single documentation source (ADR-0343). Examples under `examples/` feed pages through regions
  (ADR-0330): when a shown behaviour changes, update the example, its test and the prose, then run
  `yarn docs:regions` and `yarn docs:regions --check`.
- Stop after two comparable failed attempts without new evidence, and report.
- Commits end with the `Co-Authored-By` trailer the session gives.

## Checks

Agents run the cheap checks; the coordinator runs the expensive ones once on the merged result.

- Agents run focused tests (`yarn vitest run <paths>`, with `--project` as needed), `yarn validate:package <name…>` for
  the packages they change (it enforces per-package coverage), lint and `prettier --check` on touched files, and
  `yarn docs:regions --check` when docs or examples change. Use `--maxWorkers=2` when another job may run.
- Agents do not run `yarn validate:full`, `yarn test:e2e:built`, `yarn typecheck:typescript-7`, the form D bench or the
  DX audit, and do not build baseline worktrees, unless the task asks. They list the public types, hovers and messages
  they changed so the coordinator can target the DX audit and decide on the bench.
- Do not wait for the machine to be idle and never sleep-loop on load.
- The coordinator runs `yarn validate:full` before every merge into `main`, plus `yarn website:test` when the website
  changes and `yarn typecheck:typescript-7` when types change.

## Report

In English, concise: commits; what changed (rules, messages, codes, statuses); tests added and public tests edited
with the reason; bugs found; documentation changed and its impact classification; public surface changes for the DX
audit; checks run with their result lines and those not run; anything left for a decision.

## Choosing the model and effort

Project agents in `.claude/agents/` fix the model, effort and tools, so the coordinator picks the agent type instead
of restating them:

| Agent type     | Model  | Effort | Work                                                                           |
| -------------- | ------ | ------ | ------------------------------------------------------------------------------ |
| `investigator` | Sonnet | medium | Read-only investigation, inventories, audits (no edit tools)                   |
| `mechanic`     | Sonnet | medium | Mechanical conversions, documentation updates, tests for a given list          |
| `implementer`  | Opus   | high   | Accepted ADRs, Core runtime or type changes, security fixes, non-trivial fixes |

Trivial edits are made directly, without an agent. The coordinator also recommends a model and effort for its own
session at the start of each task: Opus with high effort for ADR design and reviews, Sonnet for mechanical batches.

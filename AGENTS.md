# UltimaBase agent guide

The contract for every coding agent and contributor. Domain rules apply only to
the work in scope; history is evidence, never authorization.

## What UltimaBase is

A modern TypeScript backend framework inspired by Parse Server, not a clone.
Core is a small kernel: schemas, queries, one operation engine, transactions and
Master authority. Everything else (Access, Hooks, ACL, roles, authentication,
REST, GraphQL, databases) is a plugin, and **Core never knows a plugin**: no
import, name or special case. Kernel extension points are added generically
when a real plugin needs them, never speculatively.

UltimaBase is pre-release. Public contracts (exports, types, hovers,
completions, diagnostics, behavior, errors) change only through
[ADR-0288](docs/adr/0288-pre-release-simplification.md): one ADR per change,
validated by the user.

## Working

1. Inspect Git status and preserve unrelated changes. Never push, publish or
   change GitHub state without explicit user confirmation.
2. Work on a focused branch; isolate parallel work in its own `git worktree`.
3. Read the [architecture index](docs/current-architecture.md#task-routing),
   then the contracts, package READMEs, accepted ADRs and
   [domain rules](docs/engineering/agent-domain-rules.md) it routes to.
   Read `ARCHITECTURE.md` fully only for cross-domain redesign.
4. For multi-session work, keep a handoff under `docs/handoff/` (scope, proof
   commands, decisions, rejected approaches, next verifiable action), commit
   checkpoints (`wip(<scope>): ...`) and delete the handoff once merged. On
   resumption, verify the handoff against the tree before trusting it.

History lives in Git tags, not in the tree: `reference-archive` (the
reference's backlog and plans) and `rebuild-archive` (the rebuild records).
Proposed directions live in [ROADMAP.md](ROADMAP.md).

## Scope and stop rules

- Implement only the user's request, a failing test or a documented contract.
  No speculative APIs, options, packages or infrastructure; do not bundle
  unrelated work.
- Prefer standard and existing solutions. A shared abstraction needs one
  current invariant or two concrete current usages.
- Stop and ask before an unapproved architectural change: explain the need,
  the minimal solution and its impact. An accepted ADR counts as approval.
- Prove a broad migration on one representative vertical slice first,
  including compiled declarations and editor behavior when relevant.
- Stop exploring after two comparable failed variants without new evidence,
  or 30 minutes without verifiable progress; report the blocker and options.
- Retry a rejected approach only with its reopening condition or the user's
  approval, and with a hypothesis explaining what changed.
- Make temporary compromises explicit in comments, the handoff or an ADR.

## Product and security invariants

- Dependencies point toward foundations: Core depends only on Shared and never
  on Plugin Kit, a plugin or infrastructure. Packages import each other through
  public exports only. `yarn constraints` enforces the graph; see
  [dependency direction](docs/engineering/agent-domain-rules.md#dependency-direction).
- The developer never writes Drizzle. Transports never issue SQL or bypass
  Runtime.
- One initialized application per JavaScript realm. Immutable models and
  builders, explicit schema registration, no Active Record, dirty tracking or
  direct adapter persistence. Schema commands go through Query and the request
  engine; Role and ACL values never gain persistence methods.
- Authority is `anonymous` or `master`. Master is server-side and unforgeable
  from transport input; it bypasses authorization, never validation, hooks,
  transactions, constraints or integrity.
- Protected policies only narrow. Keep the
  [Runtime order](docs/engineering/agent-domain-rules.md#runtime-order),
  automatic mutation transactions and post-commit delivery. No general
  `skipHooks`.
- Do not restore [removed powers](docs/engineering/agent-domain-rules.md#removed-extension-and-migration-powers)
  without an ADR.
- Schemas use only the declaration form of [ADR-0297](docs/adr/0297-declare-schemas-without-typegen.md) and [ADR-0339](docs/adr/0339-define-describes-with-configures.md): `define({ className, fields, indexes, ...features })` with static values, a final `.with((plugins) => ...)` for plugin rules and the `Register` line. Read the [retained typing boundaries](docs/current-architecture.md#retained-typing-boundaries) before inference work, and measure editor cost with the form D bench (`examples/schema-form-d`) on TypeScript 6 and 7.

## Code quality

- No `any` in any form. Validate `unknown` at untrusted boundaries.
- Classes for domain objects; immutable builders return new instances; arrow
  functions for stateless utilities.
- Completions, hovers and error messages are API: named option interfaces,
  English JSDoc with short examples, editor tests against source and built
  packages.
- Replacing an API removes the superseded one and its exports.
- English comments explain intent and invariants, not mechanics.
- File size: production warns above 400 lines and fails above 600; tests warn
  above 600 and fail above 700. No inline disables.

## Validation

- Vitest everywhere. Every bug fix gets a regression test; public generic APIs
  get runtime and type tests. PostgreSQL tests use Testcontainers with one
  schema per worker.
- Run focused tests and `yarn validate:affected` before intermediate commits.
  **`yarn validate:full` must pass before any merge into `main`**
  ([ADR-0291](docs/adr/0291-faster-validation-cadence.md)).
- Report any failed, skipped, flaky or unavailable check: the work is not done.
  Never present a partial gate as complete.
- Public tests (package `tests/`, `*.test-d.ts`, tests importing only public
  entries) protect the developer experience: a behavior-preserving change
  edits them only for import paths. Internal tests move with their module
  without losing an assertion. Run [the DX audit](tooling/dx-audit/README.md)
  against a built baseline of `main` and explain every difference.
- Review the whole diff before committing; record commands and results in the
  handoff.

## Documentation and decisions

- Classify each change's documentation impact as exactly one of `none`,
  `internal engineering documentation`, `public website documentation` or
  `both`, and explain `none`.
- Public behavior, exports, configuration, examples, errors and security
  changes update `apps/website/content/docs` in the same change (check page
  `sources` and `apps/website/content/documentation-ownership.json`) and the
  package README.
- Architecture, dependency, storage, API and security decisions get an ADR.
  Supersede ADRs; never rewrite accepted history.

## Sub-agents

Delegate only independent, bounded work, at most three or four agents at once.
The primary agent keeps central architecture, reviews every diff and runs the
complete gate.

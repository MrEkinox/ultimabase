# UltimaBase agent guide

This is the operational contract for coding agents. Domain rules are mandatory
but loaded only for the work in scope; history is evidence, never authorization.

## Start and resume

1. Inspect Git status; preserve unrelated changes. Check remote state before
   selecting a next issue; do not push without explicit user confirmation.
2. Read `README.md`, `CURRENT_PLAN.md`, the selected issue and its dependencies.
   Pick one issue unless the user explicitly defines a narrower task.
3. Use [the current architecture index](docs/current-architecture.md#task-routing)
   to read the applicable maintained contracts, package READMEs, accepted ADRs
   and [domain rules](docs/engineering/agent-domain-rules.md). Read selected
   sections completely; full `ARCHITECTURE.md` is required for cross-domain
   redesign, not for every narrow edit. Read applicable nested `AGENTS.md` too.
4. Add or refresh the issue's [Working context](issues/README.md#working-context)
   before implementation. Record exact scope, proof commands, locked decisions,
   rejected approaches and the next verifiable action. Read historical records
   only when that context or a new finding requires them.
5. On resumption, verify the checkpoint against the tree and evidence. Never
   infer completion from an earlier summary or restart an accepted limitation
   merely because its failed experiment is no longer in conversation context.

`CURRENT_PLAN.md` stays at most 80 lines: objective, active issue, locked
decisions, blocker and next action. Put detailed evidence in the issue; archive
completed execution logs under `docs/plans/completed/`. Keep the plan catalog,
issue status, milestone status and checkboxes aligned in the same change.
A fresh chat may help an independent task after a durable handoff; it is not a
replacement for the checkpoint and is not required for every issue.

## Scope, evidence and stop rules

- Implement only the selected criteria, a failing test, an existing documented
  contract or the user's explicit request. No speculative APIs, empty future
  packages, infrastructure or options. Do not combine unrelated nearby work.
- Reuse standard/native/library solutions and existing concepts. A shared
  abstraction needs one current invariant or two concrete current usages;
  hypothetical consumers do not count. Do not generalize for future flexibility.
- An unapproved architectural change requires a stop: explain the proven need,
  minimal solution, impact and what will not be anticipated; await approval.
  An accepted ADR or explicit criterion counts as approval. Stop if scope grows.
- Before a broad migration, prove one representative vertical slice against the
  actual affected consumers, including compiled declarations and editor behavior
  when relevant. Do not substitute a simplified synthetic fixture for that proof.
- Exploration stops after two comparable failed variants without new evidence,
  or 30 minutes without verifiable progress (validation wait time excluded).
  Save failures, rollback only your experiment, explain the blocker/options and
  request direction. This never waives a test, budget or accepted constraint.
- Do not retry a rejected approach without its recorded reopening condition.
  A recent user `stop` overrides every older autonomous continuation.
- Temporary compromises must be explicit in comments, issue notes or an ADR.
  Report any necessary work beyond the original criteria in the handoff.

## Global product and security invariants

- UltimaBase is a modern TypeScript backend framework inspired by Parse Server,
  not a compatible clone. Developer declarations and authorized deterministic
  plugin contributions are Runtime truth; generated declarations are replaceable.
- Core depends toward foundations, never concrete plugins, Plugin Kit or
  infrastructure. Packages import other packages through public exports only.
  The developer never writes Drizzle. Transports never issue SQL or bypass Runtime.
  Read [dependency direction](docs/engineering/agent-domain-rules.md#dependency-direction)
  for every package integration; run/update `yarn constraints`.
- One initialized application per JavaScript realm; parallel workers are isolated.
  Preserve used capabilities, immutable models/builders and explicit registration.
  No mutable Active Record, dirty tracking, direct adapter persistence or promised
  subclass extension mechanism; prefer composition and plugins.
  Schema model commands delegate through Query and RequestEngine; non-schema
  values such as Role and ACL never gain persistence methods.
- Hooks, Access, ACL, authentication and sessions are optional plugins, not Core
  products or placeholder stages. Roles/identity grant nothing by themselves.
  Read [product rules](docs/engineering/agent-domain-rules.md#product-rules) and
  [plugin rules](docs/engineering/agent-domain-rules.md#plugins) for these domains.
- Authority is `anonymous` or `master`, never `user` or `system`. Master is
  trusted server-side authority, unforgeable from transport input. It bypasses
  authorization, not validation, hooks, transactions, constraints or integrity.
- Protected constraints only narrow; rewritable physical plans never own them.
  Preserve the [Runtime order](docs/engineering/agent-domain-rules.md#runtime-order),
  automatic mutation transactions, itemized collection mutations and post-commit
  delivery. No general `skipHooks` or permission-specific Runtime stages.
- Do not restore [removed extension/migration powers](docs/engineering/agent-domain-rules.md#removed-extension-and-migration-powers)
  or remove another capability without architecture approval.
- Typegen is the sole named-schema graph. Read the
  [retained typing boundaries](docs/current-architecture.md#retained-typing-boundaries)
  before inference/generation work; no parallel registry or weaker exact types.

## Code and public API quality

- Never use `any`, implicit, asserted or public. Validate `unknown` at untrusted
  boundaries; keep precise, verifiable inference.
- Prefer classes for domain objects and immutable builders; builder methods
  return new instances. Prefer arrow functions for stateless factories/utilities.
- Treat completion, hover documentation and useful errors as API contracts.
  Prefer named option interfaces and English JSDoc with focused examples; test
  important editor behavior against both source and compiled package exports.
- API replacement includes removal of superseded implementations and barrel
  exports unless an accepted ADR preserves compatibility; protect the replacement.
- Write English comments explaining intent, invariants and non-obvious boundaries.
  Avoid duplication without abstracting coincidental similarities.
- Handwritten TypeScript: production warns above 400 lines/fails above 600;
  tests warn above 600/fail above 700. No local exceptions or disables.
  Generated artifacts are excluded by path patterns, not inline suppressions.

## Validation and completion

- Use Vitest. Every bug fix needs a regression; public generic APIs need runtime
  and compile-time tests. Test immutable builders, public exports, no deep imports,
  capability ownership/order, distinct plugin instances, conflicts, removed powers,
  cleanup, upgrades, orphaned contributions and no legacy registry bypasses.
- PostgreSQL tests use Testcontainers and one schema per worker; preserve isolation.
- Run focused checks, then `yarn validate`. Every debt reduction or
  behavior-preserving refactor must pass **`yarn validate:full` before completion
  or commit**. Ordinary `yarn test` excludes source E2E and cannot replace it.
  [ADR-0275](docs/adr/0275-canonical-repository-validation.md) defines the gate.
- Launch infrastructure/listener checks with the required permissions from the
  first run. Run build and lint sequentially; preserve CI worker bounds and budgets.
  Report failed, skipped, flaky, interrupted or unavailable required checks;
  the issue remains open. Never describe a partial gate as complete validation.
- Audit the whole diff against criteria, invariants and saved developer form.
  Fix findings, rerun invalidated checks and re-audit until no finding remains.
  Record exact commands, results, coverage and any limitations.
- Update issue status/criteria and current checkpoint only after this gate.
  Create one dedicated local commit, inspect it, and correct new findings before
  advancing. Never push without explicit user confirmation.

## Documentation and decisions

- Record exactly one `Documentation impact`: `none`, `internal engineering
documentation`, `public website documentation` or `both`. Explain `none`.
- Public behavior, exports, configuration, installation, examples, errors, security
  and integrations require same-issue review/update of `apps/website/content/docs`.
  Use `apps/website/content/documentation-ownership.json` and page `sources`;
  record why no public edit is needed if the contract remains accurate.
- Update changed package contracts in their README. Schema-domain changes require
  review of `packages/core/examples/schema` and updates when behavior/composition/
  inference/registry/validation plans change.
- Add/supersede an ADR for architecture, dependency, storage, API or security
  decisions. Never rewrite accepted history to hide a superseded decision.
  Update the current architecture index when its routing changes.
- Root specifications, package contracts and ADRs remain engineering authority;
  website prose and generated declarations never become Runtime truth.

## Coordination

Use sub-agents only when delegation is authorized and scopes are independent,
bounded and non-overlapping. Keep small changes and central architecture with
the primary agent, who owns integration and full verification.

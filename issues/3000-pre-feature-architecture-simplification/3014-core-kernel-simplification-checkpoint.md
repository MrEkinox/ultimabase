# 3014: Audit the Core and kernel simplification checkpoint

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/shared`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, transport foundations
- Depends on: 3013
- ADR: decisions from issues 3002 and 3003 plus all retained foundational ADRs

## Goal

Prove from a clean checkout that the Core-facing migration is behaviorally
complete and materially simpler before any plugin-local simplification begins.

## Acceptance criteria

- [ ] Reconcile every stable contract-matrix ID affected by issues 3001 through
      3013 against source, public surfaces, regression evidence, and its
      approved disposition.
- [ ] Every observable behavior difference maps to one exact removal explicitly
      approved in issue 3002 or 3003; any unmapped difference is a regression.
- [ ] One active application per process, concurrent request isolation,
      sequential disposal and replacement, and parallel isolated workers pass
      their lifecycle and security matrix.
- [ ] Application operations and schema mutations have one canonical compiled
      representation and immutable developer, Typegen, REST, GraphQL, and
      execution projections.
- [ ] Core dependency direction, product-neutral vocabulary, Master authority,
      monotonic policy, structural validation, transactions, cancellation,
      callback attribution, and safe errors remain intact.
- [ ] Record the post-Core production and test lines and files, Core share,
      public exports, graph concepts, representative change fan-out, startup,
      heap, request cost, coverage, and local CI durations.
- [ ] Produce the package-local baseline and suspected simplification seams for
      each of the 16 plugin issues without authorizing their implementation.

## Tests

- [ ] Run the complete gates materially affected by issues 3001 through 3013,
      including source and packed API, TypeScript, JavaScript, security,
      lifecycle, transport, PostgreSQL, and coverage checks.
- [ ] Website validation covers every public page changed by those issues.

## Audit gate

- [ ] Audit the complete Core/kernel milestone diff. Fix every routine finding
      and repeat the complete audit until no unresolved finding remains.
- [ ] If parity needs a new boundary or a change to an accepted decision, apply
      the architecture stop protocol instead of opening the plugin wave.
- [ ] Record exact evidence and Documentation impact before completion.

## Out of scope

- Simplifying a plugin's product-specific implementation or performing the
  final milestone audit.

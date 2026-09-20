# 3014: Audit the Core and kernel simplification checkpoint

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/shared`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, transport foundations
- Depends on: 3013
- ADR: decisions from issues 3002 and 3003 plus all retained foundational ADRs

## Goal

Prove from a clean checkout that the Core-facing migration is behaviorally
complete and materially simpler before any plugin-local simplification begins.

## Acceptance criteria

- [x] Reconcile every stable contract-matrix ID affected by issues 3001 through
      3013 against source, public surfaces, regression evidence, and its
      approved disposition.
- [x] Every observable behavior difference maps to one exact removal explicitly
      approved in issues 3002/3003 or a subsequent explicit architecture stop
      (ADR-0260/ADR-0262); any unmapped difference is a regression.
- [x] One active application per JavaScript realm, concurrent request isolation,
      sequential disposal and replacement, and parallel isolated workers pass
      their lifecycle and security matrix.
- [x] Application operations and schema mutations have one canonical compiled
      representation and immutable developer, Typegen, REST, GraphQL, and
      execution projections.
- [x] Core dependency direction, product-neutral vocabulary, Master authority,
      monotonic policy, structural validation, transactions, cancellation,
      callback attribution, and safe errors remain intact.
- [x] Record the post-Core production and test lines and files, Core share,
      public exports, graph concepts, representative change fan-out, startup,
      heap, request cost, coverage, and local CI durations.
- [x] Produce the package-local baseline and suspected simplification seams for
      each of the 16 plugin issues without authorizing their implementation.

## Tests

- [x] Run the complete gates materially affected by issues 3001 through 3013,
      including source and packed API, TypeScript, JavaScript, security,
      lifecycle, transport, PostgreSQL, and coverage checks.
- [x] Website validation covers every public page changed by those issues.

## Audit gate

- [x] Audit the complete Core/kernel milestone diff. Fix every routine finding
      and repeat the complete audit until no unresolved finding remains.
- [x] If parity needs a new boundary or a change to an accepted decision, apply
      the architecture stop protocol instead of opening the plugin wave.
- [x] Record exact evidence and Documentation impact before completion.

## Out of scope

- Simplifying a plugin's product-specific implementation or performing the
  final milestone audit.

## Implementation and audit record

The [checkpoint report](../../docs/plans/2026-09-21-core-kernel-simplification-checkpoint.md)
reconciles all 12 behavior IDs, 23 plugin-power IDs, 39 named protocols, five
approved differences and ten removals. All 16 later plugin packages have a
measured baseline and bounded audit questions. No plugin-local issue is
inspected or started.

The complete milestone diff retains canonical command ownership, exact private
handler/codec binding, immutable projections, source/packed public boundaries,
Master provenance, monotonic policy, lifecycle isolation and transactional
semantics. The only observed public differences map to ADR-0258 through
ADR-0262 and the explicit removal ledger. Removal searches still find no
production implementation of the retired powers. Internal counters, negative
export tests, historical evidence and unrelated field-value replacement are
intentional matches.

### Findings and corrections

1. A clean detached checkout at `0828a1f4`, with its own dependencies and no
   copied `dist` or TypeScript cache, exposed a missing create-app project
   reference. Cold root typechecking could not resolve that package in its E2E
   tests. The regression fails before the fix and passes after adding the
   reference; it checks every package against the root compiler inventory.
2. The initial validation install mistakenly skipped build scripts. Completing
   normal immutable installation restored native Argon2 and website generated
   types. This was a local validation setup failure, not a product correction.
3. Concurrent heavy gates exceeded existing test timeouts. Sequential coverage
   passes. Automatic E2E worker selection still exceeded one 5-second check;
   the complete two-worker run passes, matching the transversal CI worker cap.
   No test, timeout, configured retry, coverage exclusion or threshold changes.
4. Plan indexes still named old resume points and some labels said process
   instead of JavaScript realm. They are reconciled with the accepted contract
   and the mandatory stop after this checkpoint.

## Documentation impact

Classification: **internal engineering documentation**. The compiler inventory
contract, measured checkpoint, plan indexes, issue and removal ledger are
updated. The website ownership map and all 14 public pages changed during
3001–3013 are reviewed and covered by the site checks. This issue changes no
package API, configuration consumed by applications, installation contract,
error, generated example or security behavior; the public website and package
READMEs remain accurate without another public edit.

## Scope

The cold-build correction is required by the clean-checkout acceptance gate.
No implementation exceeds that gate or adds an architecture/public boundary.
Production TypeScript and exports are unchanged; the repository regression
adds 24 test lines. No suspended Soft Delete work is restored, and unrelated
editor settings remain outside the commit. No push is authorized.

## Final validation and handoff

- Cold forced typecheck and all publishable builds pass, including attw/publint.
- Full coverage: 608 files / 2,777 tests; ordinary two-worker run: 534 files /
  2,536 tests; built/packed/PostgreSQL two-worker run: 97 files / 381 tests.
  All pass, with no TypeScript errors. Exact durations and local timeout
  diagnostics are recorded in the checkpoint report.
- All 704 production coverage maps and every retained covered location match
  the successful 3013 report: 27,580 statements, 5,449 functions, 18,493 branch
  arms and 26,598 lines compared without a regression.
- Lint, constraints, formatting and issue metadata pass. Website content:
  17 files / 66 tests; browser/accessibility: 8 files / 56 tests; website build
  and typecheck pass.
- Production remains 704 files / 127,883 lines; Core 339 / 68,780; tests/support
  708 / 130,662; public exports 1,726 and entry declarations 858,980 bytes.
  Against the original baseline: -6,221 production lines, -4,968 Core lines,
  -106 net exports and -43,787 declaration bytes. No overall complexity or
  hosted CI speedup is claimed.

Final complete audit: **green**, with no unresolved product or architecture
finding. The dedicated commit delivers this checkpoint. The run stops here;
3015 is neither inspected nor started, and milestone 30 remains open. The next
step requires a later explicit user request. Nothing is pushed.

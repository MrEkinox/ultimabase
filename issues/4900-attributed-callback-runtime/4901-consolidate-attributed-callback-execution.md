# 4901: Consolidate attributed callback execution

- Status: stopped at audit gate
- Milestone: 49
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 4801
- ADR: ADR-0089, ADR-0189, ADR-0206

## Goal

Provide one small Core-owned callback runtime for owner attribution, async stack
propagation, depth, and same-callback recursion rejection, then remove the
parallel infrastructure from Core Runtime, Access, and Hooks.

## Acceptance criteria

- [ ] Core exports one typed application callback runtime built from the
      existing application-bound `ApplicationCallbackExecutor`.
- [ ] Core Runtime, Access, and Hooks use that implementation for attribution,
      async stack propagation, depth, and recursion detection.
- [ ] Access retains exact application/plugin attribution, fail-closed rule
      behavior, cancellation, errors, and diagnostics.
- [ ] Hooks retains exact attribution, query guards, context lifetime closing,
      cancellation, recursion diagnostics, event delivery, and observer
      isolation.
- [ ] Core retains exact Runtime callback cancellation, recursion errors, and
      application provenance.
- [ ] Public runtime and type tests cover nested ownership, depth, recursion,
      async propagation, and exact result inference.
- [ ] Package and public plugin-author documentation describe the reusable
      helper without presenting it as a Runtime authority grant.
- [ ] Production TypeScript removes more lines than it adds.
- [ ] Focused and repository-wide validation pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Changing Access or Hooks public declarations, phases, errors, or diagnostics.
- Adding callback concurrency, reentrancy, timeout, or retry options.
- Adding a capability, registry, observer protocol, or generic Runtime stage.
- Sharing product-specific cancellation, diagnostics, Hook context, or policy
  evaluation through Core.

## Documentation impact

None. The attempted public helper was fully reverted, so the existing package
and website contracts remain accurate.

## Audit outcome

The smallest working prototype introduced a public generic callback runtime and
migrated Core Runtime, Access, and Hooks without changing their focused tests.
After rebuilding Core, the targeted suites passed 5 Core, 1 Access, and 9 Hooks
tests. The prototype nevertheless failed the reduction gate:

| Production scope       |   Added | Removed |     Net |
| ---------------------- | ------: | ------: | ------: |
| Core callback boundary |     114 |       2 |     112 |
| Core Runtime consumer  |      46 |      48 |      -2 |
| Access consumer        |      45 |      51 |      -6 |
| Hooks consumer         |     104 |     120 |     -16 |
| **Total**              | **309** | **221** | **+88** |

Tests also needed 82 net new lines for the new public generic contract.

The apparent duplication is not one shared policy. Core, Access, and Hooks use
different frame identities, cancellation timing, error details, observer
semantics, context lifetime, query guards, and stack-exit behavior. A facade can
centralize `AsyncLocalStorage`, but must expose adapters for nearly every other
step. Absorbing those differences into Core would couple the kernel to optional
product semantics and contradict ADR-0189.

All prototype source and tests were reverted. This issue records a rejected
direction rather than shipping an abstraction with negative line and DX value.

# 3007: Simplify HTTP and server application ownership

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/http-plugin`, `@ultimabase/server-hono-plugin`, REST and GraphQL HTTP integrations
- Depends on: 3006
- ADR: [0258](../../docs/adr/0258-single-active-application-lifecycle.md)

## Goal

Apply the single-active-application contract to HTTP selection, server
ownership, credentials, browser policy, routes, and transport lifecycle.

## Acceptance criteria

- [x] One HTTP and server provider graph belongs to the process's active
      UltimaBase application and cannot mount a second concurrent application.
- [x] Application ID retains only the identity or protocol responsibility
      accepted by issue 3002; obsolete same-server application selection is
      removed from request routing, errors, headers, options, and documentation.
- [x] Raw Master verification, session resolution, request context, browser
      policy, preflight, route collision checks, and safe pre-dispatch failures
      remain application-owned and non-forgeable.
- [x] REST, GraphQL Yoga, GraphiQL, Apollo Sandbox, and Password Auth continue to
      compose through the retained HTTP boundary without importing siblings.
- [x] Listener start, stop, failure cleanup, restart policy, and user-supplied
      Hono integration retain exact ownership and disposal behavior.
- [x] Shared-server multi-application code and tests are deleted with no
      compatibility router or dormant application map.

## Tests

- [x] HTTP, Hono, REST, Yoga, explorers, sessions, Master, CORS, listener,
      JavaScript, packed package, and PostgreSQL public verticals pass.
- [x] Relevant typecheck, lint, build, constraints, browser, and network E2E pass.

## Audit gate

- [x] Audit every public HTTP route and credential boundary plus all removed
      application-selection symbols. Correct findings and repeat until the
      single-owner request path is complete and green.
- [x] Record behavior, performance, line, file, test, and Documentation impact
      evidence before completion.

## Out of scope

- Changing REST or GraphQL resource semantics and command transport metadata.

## Approved HTTP boundary refinement

The user explicitly approved the minimal public dispatch utility after the
architecture stop, recorded in ADR-0260. It preserves rejection after shutdown
without retaining the multi-application table or duplicating HTTP security
checks in Hono. The next issue still requires this issue's green audit and
local commit. The hard stop remains after issue 3014.

## Delivery and audit

Removed `HttpApplicationMountTable`, its configuration-only
`HttpServerProviderCompatibility` type, immutable application arrays,
mount/unmount/select bookkeeping, Hono's started-application set, shared-policy
comparison and last-mount listener accounting. `HttpServerOwnership`, exact
protocol/original-header capability validation and endpoint collision checks
remain. The prepared-dispatch WeakMap and internal bridge are also removed.

The approved ADR-0260 utility delegates to a present HTTP owner or preserves
safe original-header/correlation validation and rejection when the owner is
absent. Exact encoded browser-bootstrap ownership now lives in the application
fetch boundary. It retains GET-only behavior, explicit-header precedence,
exact owned routes, signal and query preservation, credentials, Master audit,
deadlines, attribution and response privacy. No table or compatibility router
remains behind the new function.

Hono admits one owner, rejects a competing owner without changing listener or
CORS policy, closes admission before graceful shutdown, and ignores stale-owner
teardown after sequential reuse. Failed listener cleanup retains its exact
owner/resource for disposal. External listeners and ordinary Hono routes remain
under developer ownership; only the inactive dispatcher remains and rejects
requests without retaining an application or doing background work.

The complete audit/fix loop checked public exports and editor contracts,
protocol compatibility, sensitive-header cardinality, bootstrap identity,
preflight/CORS, context and Master privacy, sessions, lifecycle serialization,
cleanup failure, stale disposal, plugin ownership and all removed symbols.
It fixed loss of the absent-owner response, moved browser tests from fake
application dispatch to real HTTP, and retained a failed-startup listener whose
cleanup had failed. The browser fixture now verifies that a valid Master request
reaches Master mode while the raw key remains hidden from its handler.

Tests retain direct HTTP and browser checks, exact response/status/correlation
assertions, graceful in-flight response completion, address-conflict rollback,
provider reuse and unrelated external routes. Only successful shared mounting
and table-specific immutable mutation tests are retired. HTTP protocol rejection
is covered at capability composition before consumer setup. Source and compiled
root inventories reject both removed exports and include the new utility;
JavaScript without Typegen exercises active and absent dispatch.

Documentation impact: both. Updated HTTP/Hono package contracts, root architecture,
agent guidance, transport concepts and the public website HTTP/Hono journeys,
GraphQL cross-reference, Master identity wording and package index. ADR-0260
records the explicit approval without rewriting accepted history. Explorer
README contracts remain accurate because their public URLs and behavior are
unchanged; only their tests stop constructing a mount table.

Scope: the new public utility was explicitly approved after the architecture
stop. The cleanup regression is required by this issue's exact ownership and
failure-cleanup criteria. No Core implementation, REST/GraphQL resource API,
authentication behavior, public test helper, coverage threshold, exclusion or CI
configuration changed. The unrelated editor setting and Soft Delete stash remain
untouched. No push is authorized.

Validation (local runs, not hosted CI):

- `yarn typecheck`: passed. A forced rebuild restored incremental declaration
  output after packaging; the final ordinary command passed.
- `yarn test --maxWorkers=2`: 532 files, 2,523 tests passed, no type errors,
  196.42 s.
- `yarn test:e2e:built --maxWorkers=2`: 97 files, 379 tests passed, 152.20 s.
- `yarn build`: passed in 43.446 s, including attw and publint.
- Focused HTTP/Hono tests: 20 files, 125 tests passed, including real Chromium.
- `yarn website:validate`: 17 files, 66 tests passed, 17.36 s.
- Affected package/workspace lint, constraints, formatting, issue metadata and
  `git diff --check`: passed.
- Complete coverage was not rerun. No thresholds, exclusions or timeouts changed.

The global unit and integration runs overlapped; their durations are validation
observations, not a controlled CI comparison. The first runtime microbenchmark
also overlapped tests and was discarded as timing evidence. A quiet 20-lifetime
rerun reported medians of startup 1.677 ms, read 0.447 ms, mutation 0.522 ms;
heap before construction 8,955,208 bytes, after startup 9,977,728 bytes, after
requests 10,173,752 bytes. The preceding issue recorded 1.651 / 0.418 / 0.524 ms.
This scenario has no HTTP plugin, and does not measure an HTTP speedup.

Compared with issue 3006's delivered source and built exports:

| Measure                       |  Before |   After |  Delta |
| ----------------------------- | ------: | ------: | -----: |
| Production TypeScript files   |     697 |     698 |     +1 |
| Production TypeScript lines   | 128,037 | 127,797 |   -240 |
| Core TypeScript lines         |  68,624 |  68,624 |      0 |
| Test/support TypeScript files |     702 |     706 |     +4 |
| Test/support TypeScript lines | 129,476 | 129,691 |   +215 |
| Public exports                |   1,727 |   1,726 |     -1 |
| Built entry declaration bytes | 859,418 | 858,344 | -1,074 |

The new internal files separate bootstrap preparation and the small public
server dispatcher while removing the larger mount-table implementation. Exact
whole-commit added/deleted/net lines, including documentation, are reported to
the user after the dedicated commit.

Final audit: green, no unresolved finding. Continue with issue 3008 only after
this dedicated local commit. No push. Stop after issue 3014.

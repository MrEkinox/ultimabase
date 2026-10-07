# Architecture simplification baseline

- Baseline source revision: `5806d87a879df0db8265579737c83111eb6030f9`
- Recorded: 2026-09-20
- Contract matrix: [architecture contract matrix](2026-09-20-architecture-contract-matrix.md)
- Measurement command: `yarn measure:simplification`

This baseline records the product before milestone 30 changes Runtime or public
contracts. The source revision is the last implementation commit before issue 3001. The measurement-only script and documentation do not change package
source, Runtime behavior, exports, or test thresholds. The unrelated local
`.vscode/settings.json` edit is excluded from this work.

## Repeatable environment

The local measurements were collected on Darwin 24.6.0 x86_64 with Node
24.20.0 and Yarn 4.9.2. Durations are wall-clock samples from this machine, not
budgets or cross-machine performance claims. Run the following from the
repository root after `yarn build`:

```sh
yarn measure:simplification
yarn measure:runtime-baseline
yarn typecheck
yarn build
yarn test:performance
yarn test
env NODE_OPTIONS=--max-old-space-size=6144 yarn lint
```

`measure:simplification` reads built `dist/index.d.ts` entries, so it fails
instead of silently measuring stale or missing declarations when a package has
not been built.

## Repository size and public surface

Definitions used by the script:

- production: non-generated, non-test TypeScript under `packages/*/src`;
- tests: TypeScript tests and TypeScript support below `tests` directories;
- tooling: non-generated, non-test TypeScript under `tooling`;
- lines: physical UTF-8 lines excluding the final empty line;
- public exports: module symbols resolved by TypeScript from each built
  `dist/index.d.ts`;
- declaration bytes: byte size of those declaration entry points.

| Scope                  | Files |   Lines | Public exports |
| ---------------------- | ----: | ------: | -------------: |
| Production packages    |   706 | 134,104 |          1,832 |
| Core                   |   341 |  73,748 |          1,174 |
| Tests and test support |   689 | 131,314 |              — |
| Tooling                |    13 |   2,121 |              — |

Core owns 54.99% of production TypeScript lines. Built package entry
declarations total 902,767 bytes.

| Package                              | Files |  Lines | Exports | Declaration bytes |
| ------------------------------------ | ----: | -----: | ------: | ----------------: |
| `@ultimabase/access-plugin`          |    29 |  5,227 |      79 |            36,909 |
| `@ultimabase/acl-permissions-plugin` |    19 |  3,725 |      42 |            19,465 |
| `@ultimabase/apollo-sandbox-plugin`  |     4 |    293 |       5 |             2,730 |
| `@ultimabase/core`                   |   341 | 73,748 |   1,174 |           611,525 |
| `@ultimabase/create-app`             |     9 |  1,724 |      15 |             5,544 |
| `@ultimabase/graphiql-plugin`        |     4 |    280 |       5 |             2,626 |
| `@ultimabase/graphql-http`           |     2 |     82 |       3 |               783 |
| `@ultimabase/graphql-plugin`         |    52 |  8,795 |      33 |            11,934 |
| `@ultimabase/graphql-yoga-plugin`    |     8 |    815 |       4 |             2,693 |
| `@ultimabase/hooks-plugin`           |    33 |  5,620 |     102 |            47,914 |
| `@ultimabase/http-plugin`            |    13 |  2,719 |      65 |            20,325 |
| `@ultimabase/password-auth-plugin`   |    21 |  3,330 |      32 |            15,967 |
| `@ultimabase/pg-vector-plugin`       |     1 |    246 |      11 |             4,200 |
| `@ultimabase/plugin-kit`             |     8 |  1,317 |      44 |            22,041 |
| `@ultimabase/postgres-plugin`        |    65 | 10,891 |      39 |            15,475 |
| `@ultimabase/rest-plugin`            |    27 |  4,966 |      45 |            20,685 |
| `@ultimabase/roles-plugin`           |    12 |  2,397 |      40 |            18,614 |
| `@ultimabase/server-hono-plugin`     |     5 |    533 |       6 |             3,575 |
| `@ultimabase/shared`                 |     2 |     85 |       9 |             2,070 |
| `@ultimabase/soft-delete-plugin`     |     8 |    788 |       5 |             3,473 |
| `@ultimabase/testing`                |    11 |  1,771 |      32 |            17,312 |
| `@ultimabase/typegen`                |    25 |  3,965 |      33 |            12,517 |
| `@ultimabase/validation-plugin`      |     7 |    787 |       9 |             4,390 |

The byte values are reproducible through the measurement script. They are a
size indicator for the entry declarations, not the size of a packed npm
tarball.

## Kernel shape

Static source inspection reports 38 ordinary `defineCapability` calls, two
adapter-contribution capability definitions, and one raw-adapter capability
definition. The resulting named public protocol inventory contains 39
non-fixture tokens; [the contract matrix](2026-09-20-architecture-contract-matrix.md#named-capability-protocols)
classifies every token.

Production source contains no call to `defineQueryExtension` or
`decorateCapability`. The only two calls to generic `replaceCapability` are the
Core-owned `replaceSchemaCompiler` and `replaceRuntime` wrappers. The schema
compiler replacement has no production consumer. Runtime replacement has one
production-package consumer, `RuntimeCostProbe` in `@ultimabase/testing`, whose
purpose is test instrumentation rather than application behavior. These facts
make the mechanisms review candidates, not authorized removals.

Typegen has three manual declaration levels. `typegen:reference` is consumed by
Password Auth and Soft Delete. No official production plugin requests
`typegen:contribute` or `typegen:emit`; their implementations, exports, tests,
and accepted ADR promises still make them supported contracts pending issue 3003.

## Command representations and change fan-out

An application operation currently crosses these representations:

1. `PluginOperationDefinition` and its declaration owner;
2. the application-surface registry's compiled operation;
3. a `PluginOperationHandler` capability contribution;
4. an `OperationTransportBinding` capability contribution;
5. the application operation transport plan;
6. the Runtime operation dispatcher;
7. generated application and model surfaces;
8. REST and GraphQL projections.

A schema mutation currently crosses these representations:

1. `PluginSchemaMutationDefinition` and its declaration owner;
2. `PluginSchemaMutationSurfaceBinding` on a selected schema;
3. the compiled application schema-mutation surface;
4. a schema-mutation handler capability contribution;
5. a schema-mutation transport binding contribution;
6. a schema-mutation transport plan;
7. Runtime execution plus Typegen, REST, and GraphQL projections.

Source-symbol fan-out illustrates the maintenance cost. Operation definitions
appear in 21 production files, operation handlers in 8, and application
operation transport plans in 11. Schema-mutation definitions appear in 16,
schema-mutation surfaces in 7, handlers in 5, and transport plans in 7.

Representative changes have the following direct production/documentation
fan-out:

| Change                   | Direct files carrying its product name | Boundaries crossed                                                                                   |
| ------------------------ | -------------------------------------: | ---------------------------------------------------------------------------------------------------- |
| Password Auth operations |                                      9 | declaration, handler, TypeScript methods, REST/cookie routes, GraphQL bindings, initializer, website |
| Soft Delete mutations    |                                      5 | declaration, model surfaces, handlers, protected visibility, administration                          |
| PostgreSQL vector field  |                                      4 | field builder, plugin field, initializer, website                                                    |

The name-based count deliberately understates generic Core and transport files.
It is a stable comparison aid for later issues, not a dependency graph.

## Runtime and validation cost

| Measurement                         |          Baseline |
| ----------------------------------- | ----------------: |
| `yarn typecheck` wall time          |           26.47 s |
| `yarn build` wall time              |           37.29 s |
| `yarn test:performance` wall time   |           14.22 s |
| Performance suite peak resident set | 336,699,392 bytes |
| `yarn test` wall time               |           90.16 s |

`yarn measure:runtime-baseline` runs 20 sequential no-product applications
against the deterministic in-memory adapter. With explicit garbage collection
before each sample, its medians were:

| Application measurement              |         Baseline |
| ------------------------------------ | ---------------: |
| Startup                              |         1.706 ms |
| One in-memory read                   |         0.422 ms |
| One in-memory mutation               |         0.502 ms |
| Heap before application construction |  9,088,640 bytes |
| Heap after startup                   | 10,133,984 bytes |
| Heap after the read and mutation     | 10,320,648 bytes |

These elapsed and V8 heap figures are comparison samples from the recorded
machine. The structural counters below remain the deterministic regression
gate.

The performance suite itself reports 13.17 seconds for 3 tests in 2 files. Its
resident-set measurement covers the Yarn/Vitest process tree observed by the
host and is therefore a regression reference, not application heap alone.

The deterministic no-product scenario records startup and in-memory request
work independently of timing noise:

| Counter                                                   | Baseline |
| --------------------------------------------------------- | -------: |
| Runtime assemblies                                        |        1 |
| Optional behavior bundles/stages                          |    0 / 0 |
| Optional enforcement bundles/stages                       |    0 / 0 |
| Behavior/enforcement calls for one read plus one mutation |    0 / 0 |
| Database reads                                            |        1 |
| Prepared/executed mutations                               |    1 / 1 |
| Transactions/commits                                      |    1 / 1 |

This is the retained zero-cost invariant for absent optional engines. Elapsed
request microbenchmarks are deliberately not inferred from a three-test Vitest
run; the structural counters detect added neutral stages deterministically.

The full lint sample required a 6 GiB Node heap, matching CI. The first default
heap run exhausted memory after Core lint; that result is an environment fact,
not a source failure. Final issue validation uses
`NODE_OPTIONS=--max-old-space-size=6144`.

## Behavior snapshots

The baseline is protected by existing source, packed-package, type-level, and
integration suites. Later issues must keep the following matrix IDs and these
representative proofs aligned:

| Boundary                         | Baseline proof                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Public source and packed exports | package `public-api` and language-service suites; Core packed language-service fixture             |
| Typegen output                   | `@ultimabase/typegen` generator/snapshot tests and package fixtures under `tests/fixtures`         |
| JavaScript without Typegen       | packed REST, packed GraphQL, relation-filter, and Soft Delete no-Typegen E2E suites                |
| Direct TypeScript                | Core Query/model/runtime suites and official-plugin public API suites                              |
| REST                             | REST read, mutation, nested-write, application, and authenticated vertical E2E suites              |
| GraphQL                          | networkless, schema execution, Relay, nested-write, and Yoga suites                                |
| PostgreSQL                       | Core and official-plugin `.postgres.e2e.test.ts` suites with isolated worker schemas               |
| Master                           | Core Master authority tests plus REST, GraphQL, ACL, Password Auth, and Soft Delete E2E assertions |
| Access and Hooks                 | official conformance suites, schema-mutation suites, and PostgreSQL E2E suites                     |
| ACL and Roles                    | containment, subject resolution, reference cleanup, storage, event, and PostgreSQL suites          |
| Validation                       | final mutation guard, field contract, and Runtime behavior suites                                  |
| Password Auth                    | sessions, identities, methods, profile, HTTP, REST, and GraphQL E2E suites                         |
| Soft Delete                      | visibility, replacement, administration, packed JavaScript, and PostgreSQL E2E suites              |

Issue 3001 changes none of these behaviors or their thresholds.

## Hosted CI reference

The latest successful main CI available during this inventory is run
[35508096382](https://github.com/MrEkinox/ultimadatabase/actions/runs/35508096382)
at commit `ce8ff424c7aeb132b2bc9fc9c0b569c95d885b5e`. It ran from 11:31:54Z to
11:49:20Z, an elapsed workflow time of 17 minutes 26 seconds. The build job ran
2 minutes 15 seconds; its project-reference check took 65 seconds and package
build step 24 seconds. Complete coverage ran 14 minutes 39 seconds, including
13 minutes 27 seconds for `yarn test:coverage`.

Package, website, transversal, and coverage jobs overlap. Their individual
durations must not be added or treated as the workflow elapsed time. The hosted
reference predates the local planning commits and is recorded separately from
the local issue-3001 measurements.

## Baseline use

Every milestone issue compares its diff with the stable IDs in the contract
matrix. A missing or contradictory consumer keeps a contract retained and
triggers the architecture stop protocol. Only issues 3002 and 3003 may turn the
recorded proposals into approved differences; issue 3001 removes nothing.

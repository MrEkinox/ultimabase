# Benchmark

Repeatable benchmarks for schema compilation, query compilation, CRUD
throughput, GraphQL execution, and optional Runtime overhead. Benchmarks never
replace correctness tests.

## Typegen editor measurements

`packages/typegen/tests/performance/typegen-editor.performance.test.ts` compares two isolated
Node.js processes over the same synthetic application with 48 schemas and 12
scalar fields per schema. The recursive scenario models the former
field-map-driven public type expansion. The generated scenario uses one named
item, create, update, where, select, include, Access, and Hooks contract per
schema, matching Typegen's current output strategy. Both scenarios also exercise
schema handles, one exact plugin operation, the installed-only field option
shapes used by Access, Hooks, and Validation, and independent alternative policy
and behavior contracts.

The probe records TypeScript semantic-check duration, first completion latency,
first hover latency and output, V8 heap use, and resident process memory. Five
alternating samples per scenario run in fresh processes with explicit garbage
collection before each memory snapshot, and the report uses the median. The
suite verifies correct diagnostics, field completions, and compact generated
hover output, but deliberately has no timing or memory threshold: those
observations vary by CPU, operating system, and TypeScript release.

Run the package-owned probe with `yarn workspace @ultimabase/typegen
test:performance`, or run it with the other performance checks:

```sh
yarn test:performance
```

The final issue 810 measurements and their environment are recorded in the
issue itself. They are evidence for this representative fixture, not a promise
of a fixed improvement for every application.

## Optional Runtime cost

Run the deterministic no-product comparison from the repository root:

```sh
yarn test:performance
```

`tests/performance/no-product-runtime-cost.performance.test.ts` starts four
otherwise identical applications: no optional product, official Hooks,
official Access, and both products. Each application executes one collection
read and one transactional create against the same deterministic adapter. The
fixture records:

- instrumented Runtime assemblies;
- materialized optional behavior and enforcement bundles and their stage count;
- optional behavior and enforcement stage calls for each request;
- adapter reads, prepared and executed mutations, transactions, and commits.

These counters are the regression signal. They do not depend on CPU speed,
timer precision, PostgreSQL, Docker, or worker scheduling. The no-product
budget permits exactly one instrumented Runtime assembly and requires zero
optional bundles, stages, and request calls. The adapter must still observe
exactly one read, one prepared and executed mutation, one transaction, and one
commit. A fixture with an intentionally neutral behavior stage proves that the
budget fails when placeholder work is introduced.

The claim is deliberately narrower than literal zero CPU overhead: omitting
Hooks and Access means no stage or materialization owned by those optional
products. Core still performs application assembly, structural validation,
query execution, transactions, result materialization, and other installed
generic capability work.

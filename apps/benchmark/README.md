# Benchmark

Repeatable benchmarks for schema compilation, query compilation, CRUD
throughput, GraphQL execution, and optional Runtime overhead. Benchmarks never
replace correctness tests.

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

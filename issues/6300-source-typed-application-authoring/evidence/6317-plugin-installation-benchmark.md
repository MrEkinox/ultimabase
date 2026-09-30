# Issue 6317 plugin-installation benchmark checkpoint

The locked 1/10/50-schema TypeScript fixture passed after removing constructor
plugin installation. Each row is the median of three counterbalanced isolated
processes. Times are milliseconds; heap is MiB.

| Schemas | Form    | Cold check | Edit diagnostic | Declaration bytes | Peak heap |
| ------: | :------ | ---------: | --------------: | ----------------: | --------: |
|       1 | current |    2398.99 |          616.73 |            17,259 |    478.90 |
|       1 | hybrid  |    2283.79 |          419.46 |             2,944 |    440.54 |
|      10 | current |    3594.55 |         2052.84 |           136,265 |    840.38 |
|      10 | hybrid  |    2423.62 |          583.59 |            28,866 |    444.36 |
|      50 | current |    8299.71 |         6509.35 |           660,585 |   1464.08 |
|      50 | hybrid  |    3070.10 |         1264.13 |           143,546 |    547.76 |

All diagnostic, completion, hover, regeneration, declaration-size, latency,
and heap assertions passed. At 50 schemas, hybrid cold checking is 2.0% faster
than issue 6312's final 3134.10 ms checkpoint and 7.8% slower than the
original issue 6301's 2846.92 ms proof. Hybrid heap is 0.8% above issue
6312's 543.57 MiB and 9.3% above issue 6301's 501.07 MiB. These are
synthetic proof figures, not the final production Typegen output: the fixture
still omits complete generated `WhereInput`. Issue 6316 owns that measurement.

The separate 20-iteration no-product Runtime sample passed with medians of
1.004 ms startup, 0.414 ms read, and 0.521 ms mutation. The locked Runtime
stage-count assertions also passed within `yarn validate:full`; no optional
product stage appeared in a no-product application.

Commands:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
yarn measure:runtime-baseline
```

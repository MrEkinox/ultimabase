# Issue 6318 schema-authoring benchmark checkpoint

The locked 1/10/50-schema TypeScript fixture passed after moving ordinary
schema creation to configured application factories. Each row is the median
of three counterbalanced isolated processes. Times are milliseconds; heap is
MiB.

| Schemas | Form    | Cold check | Edit diagnostic | Declaration bytes | Peak heap |
| ------: | :------ | ---------: | --------------: | ----------------: | --------: |
|       1 | current |    2507.59 |          646.82 |            17,259 |    477.60 |
|       1 | hybrid  |    2462.73 |          429.74 |             2,944 |    444.32 |
|      10 | current |    3722.59 |         2104.06 |           136,265 |    820.20 |
|      10 | hybrid  |    2503.10 |          607.33 |            28,866 |    446.79 |
|      50 | current |    8505.69 |         6716.47 |           660,585 |   1464.69 |
|      50 | hybrid  |    3116.72 |         1309.53 |           143,546 |    550.42 |

All diagnostic, completion, hover, regeneration, declaration-size, latency,
and heap assertions passed. At 50 schemas, the hybrid cold check is 1.5%
slower, the edit diagnostic 3.6% slower, and peak heap 0.5% higher than issue
6317's checkpoint. These small shifts are not evidence of a regression on
their own. The fixture remains a synthetic proof, not the final production
Typegen output: it omits complete generated `WhereInput`. Issue 6316 owns
the end-to-end measurement and final assessment.

The separate 20-iteration no-product Runtime sample passed with medians of
1.014 ms startup, 0.417 ms read, and 0.526 ms mutation. Issue 6317's
corresponding medians were 1.004, 0.414, and 0.521 ms; these small shifts
do not indicate a material Runtime regression. The locked Runtime stage-count
checks also passed within `yarn validate:full`.

Commands:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
yarn measure:runtime-baseline
```

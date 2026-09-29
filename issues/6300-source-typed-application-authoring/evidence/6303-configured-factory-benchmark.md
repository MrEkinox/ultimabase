# Issue 6303 configured-factory benchmark

Recorded on 2026-09-29 from the uncommitted issue-6303 tree based on revision
`9878f191`, on macOS 15.7.9 x86_64, Node.js 24.20.0, and TypeScript 6.0.3.
The scenarios, isolated-process sampling, p95 warm reads, and units are the same
as the locked [issue-6301 baseline](6301-hybrid-benchmark.md). Each pair is now
counterbalanced: sample one runs current then hybrid, while sample two runs
hybrid then current. This prevents process order, startup heat, or host-load
drift from systematically favoring either form. The test emits every raw sample
in its log; the durable checkpoint below records their mathematical medians.

Every cold and language-service diagnostic count was zero. Every edited
fixture produced exactly one focused diagnostic.

## Median checkpoint

| Schemas | Form    | Regen | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Declarations | Peak heap |
| ------: | :------ | ----: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | -----------: | --------: |
|       1 | current | 29.84 |    2209.61 |  295.16 |      0.877 | 0.620 |      0.047 |             620.84 |       18,410 |    434.18 |
|       1 | hybrid  | 36.63 |    2013.77 |  295.29 |      0.746 | 0.617 |      0.042 |             418.01 |        2,944 |    393.44 |
|      10 | current | 48.50 |    2776.63 |  307.65 |      0.832 | 0.726 |      0.050 |            1267.21 |      137,416 |    502.69 |
|      10 | hybrid  | 56.01 |    2130.66 |  308.68 |      0.832 | 0.676 |      0.044 |             589.67 |       28,866 |    436.36 |
|      50 | current | 87.27 |    5777.19 |  382.40 |      1.126 | 0.717 |      0.054 |            3942.09 |      661,736 |   1173.66 |
|      50 | hybrid  | 91.92 |    2830.87 |  327.79 |      0.932 | 0.685 |      0.050 |            1403.65 |      143,546 |    503.21 |

At 50 schemas the hybrid form remains 51.0% faster for cold checking, 64.4%
faster from edit to diagnostic, 78.3% smaller in generated declarations, and
57.1% lower in peak heap than the current generated form. Snapshot generation
is 5.3% slower, while language-service initialization is 14.3% faster. All
warm editor p95 values remain below 1 ms.

## Evolution from the preceding checkpoint

Issue 6302 changed only documentation, so issue 6301 is both the original and
immediately preceding measured checkpoint. For the hybrid form:

| Schemas |  Regen | Cold check | LS init | Edit to diagnostic | Declarations | Peak heap |
| ------: | -----: | ---------: | ------: | -----------------: | -----------: | --------: |
|       1 | +0.30% |     -2.14% |  -3.12% |             +1.91% |         0.0% |    +0.61% |
|      10 | +0.38% |     -1.68% |  +5.16% |             +1.34% |         0.0% |    +0.48% |
|      50 | -0.48% |     -0.56% |  +0.79% |             -2.85% |         0.0% |    +0.43% |

These small bidirectional movements are within process-level measurement
variation. The configured-factory issue adds no generated schema declaration
and shows no material compiler, editor, or memory regression.

Two longer repository runs exposed an order-sensitive language-service timing:
the current form always ran before the hybrid form, and the hybrid measurement
occasionally inherited a transient host-load penalty. The benchmark now
counterbalances the process order and passes every original budget. No fixture,
sample count, threshold, or asserted editor capability was weakened.

The reproducible command is:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```

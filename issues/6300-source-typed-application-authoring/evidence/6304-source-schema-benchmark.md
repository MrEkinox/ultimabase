# Issue 6304 source-schema checkpoint

Recorded on 2026-09-29 from the uncommitted issue-6304 tree based on revision
`7b17502b`, on macOS 15.7.9 x86_64, Node.js 24.20.0, and TypeScript 6.0.3.
The isolated processes, counterbalanced sample order, p95 warm reads, fixtures,
and units are unchanged from the locked
[issue-6303 checkpoint](6303-configured-factory-benchmark.md). The test emitted
every raw sample in its log; the durable checkpoint below records their
mathematical medians.

Every cold and language-service diagnostic count was zero. Every edited
fixture produced exactly one focused diagnostic.

## Median checkpoint

| Schemas | Form    | Regen | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Declarations | Peak heap |
| ------: | :------ | ----: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | -----------: | --------: |
|       1 | current | 29.60 |    2234.74 |  291.19 |      0.945 | 0.655 |      0.054 |             613.96 |       18,410 |    446.46 |
|       1 | hybrid  | 36.98 |    2266.42 |  312.31 |      0.694 | 0.587 |      0.054 |             411.07 |        2,944 |    407.02 |
|      10 | current | 48.64 |    2908.30 |  302.65 |      0.906 | 0.780 |      0.068 |            1396.06 |      137,416 |    558.72 |
|      10 | hybrid  | 55.28 |    2213.75 |  322.63 |      0.863 | 0.676 |      0.057 |             600.03 |       28,866 |    408.62 |
|      50 | current | 87.25 |    6285.19 |  371.12 |      1.152 | 0.784 |      0.096 |            4436.71 |      661,736 |   1313.56 |
|      50 | hybrid  | 90.69 |    2841.27 |  323.44 |      1.120 | 0.691 |      0.056 |            1400.55 |      143,546 |    515.71 |

At 50 schemas the hybrid target is 54.8% faster for cold checking, 68.4%
faster from edit to diagnostic, 78.3% smaller in declarations, and 60.7% lower
in peak heap than the current generated form. Language-service initialization
is 12.9% faster. Snapshot generation is 3.9% slower, and every warm editor p95
remains below 1.2 ms.

## Evolution from issue 6303

For the 50-schema hybrid target, the delivered Core-schema work remains stable
against the immediately preceding checkpoint:

| Metric             | Evolution |
| :----------------- | --------: |
| Regeneration       |    -1.34% |
| Cold check         |    +0.37% |
| LS initialization  |    -1.33% |
| Edit to diagnostic |    -0.22% |
| Declarations       |     0.00% |
| Peak heap          |    +2.48% |

These small bidirectional movements are consistent with process-level
measurement variation. The 1-schema cold result is 1.4% slower than the
current form in this sample while remaining within the locked 1.5% budget; the
10- and 50-schema scaling improvements remain substantial.

The locked benchmark still models the complete accepted plugin-source target,
not only the portion implemented by issue 6304. Issue 6304 separately executes
the delivered `UltimaBase.Schema.define()` implementation through source and
packed language-service profiles at 1, 10, and 50 schemas. Later plugin issues
will progressively replace the saved target's projections with production
types while retaining this same comparison, so checkpoint evolution cannot be
mistaken for proof that an unimplemented plugin projection already ships.

The reproducible commands are:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
yarn vitest run --project e2e packages/core/tests/e2e/core-source-schema-profiles.e2e.test.ts --maxWorkers=1
```

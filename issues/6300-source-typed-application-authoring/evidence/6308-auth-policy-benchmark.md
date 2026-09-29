# Issue 6308 source-typing benchmark checkpoint

The locked 1/10/50-schema test ran three counterbalanced, isolated samples per
form after the rejected configured Password User overload was removed. `current`
retains full generated declarations; `hybrid` keeps the single generated
schema-name graph and infers local plugin surfaces from source. This fixture
guards the milestone TypeScript budget but does not isolate Password Auth
operation handles, so its improvement is not attributed to issue 6308 alone.
Times are milliseconds, heap is MiB, and the summaries are mathematical
medians of the corresponding raw samples.

## Median checkpoint

| Schemas | Form    | Generation | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Declaration bytes | Peak heap |
| ------: | :------ | ---------: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | ----------------: | --------: |
|       1 | current |      29.51 |    2352.12 |  294.27 |      0.799 | 0.584 |      0.053 |             599.76 |            17,259 |    483.59 |
|       1 | hybrid  |      35.43 |    2241.22 |  293.58 |      0.814 | 0.598 |      0.045 |             409.38 |             2,944 |    434.99 |
|      10 | current |      48.88 |    3457.66 |  311.10 |      0.875 | 0.635 |      0.047 |            1908.50 |           136,265 |    766.71 |
|      10 | hybrid  |      53.93 |    2387.38 |  289.59 |      0.801 | 0.587 |      0.052 |             582.18 |            28,866 |    441.96 |
|      50 | current |      84.25 |    7708.65 |  365.67 |      1.054 | 0.757 |      0.048 |            6105.28 |           660,585 |   1303.27 |
|      50 | hybrid  |      90.18 |    3020.14 |  322.27 |      0.884 | 0.653 |      0.050 |            1262.15 |           143,546 |    547.03 |

At 50 schemas, the hybrid form is 60.8% faster for cold checking, 79.3%
faster for complete edit diagnostics, 78.3% smaller in generated declarations,
58.0% lower in peak heap, and 11.9% faster to initialize the language service.
Generation is 7.0% slower. Every cold editor diagnostic count was zero; the
edited fixtures each produced one focused diagnostic. Warm editor medians
remain near or below one millisecond.

Against the original issue-6301 hybrid proof at 50 schemas, cold checking is
6.1% slower and peak heap is 9.2% higher, both within the locked 10% and 15%
budgets. Edit-to-diagnostic is 12.6% faster, language-service initialization
0.9% faster, and generation 2.4% faster. Against the immediately preceding
issue-6307 hybrid checkpoint, cold checking and edit diagnostics differ by
less than 0.4%, language-service initialization is 1.0% slower, generation
1.8% slower, and peak heap is unchanged to one decimal place. These small
host-timing changes are not evidence of a Password Auth regression.

## Raw samples

| Schemas | Form    | Sample | Generation | Cold check | LS init | Completion | Hover | Diagnostic | Edit to diagnostic | Peak heap |
| ------: | :------ | -----: | ---------: | ---------: | ------: | ---------: | ----: | ---------: | -----------------: | --------: |
|       1 | current |      1 |      29.36 |    2369.54 |  287.40 |      1.313 | 0.588 |      0.065 |             599.76 |    476.36 |
|       1 | current |      2 |      29.51 |    2352.12 |  296.32 |      0.799 | 0.584 |      0.039 |             599.34 |    483.59 |
|       1 | current |      3 |      29.59 |    2342.81 |  294.27 |      0.794 | 0.579 |      0.053 |             613.93 |    483.68 |
|       1 | hybrid  |      1 |      35.17 |    2254.39 |  291.74 |      0.679 | 0.553 |      0.044 |             409.38 |    439.40 |
|       1 | hybrid  |      2 |      35.43 |    2241.22 |  293.58 |      0.906 | 0.782 |      0.053 |             408.55 |    434.99 |
|       1 | hybrid  |      3 |      35.61 |    2215.99 |  307.58 |      0.814 | 0.598 |      0.045 |             410.67 |    432.87 |
|      10 | current |      1 |      48.88 |    3476.96 |  310.07 |      1.069 | 0.680 |      0.063 |            1924.59 |    766.71 |
|      10 | current |      2 |      47.65 |    3457.66 |  325.71 |      0.875 | 0.618 |      0.045 |            1900.87 |    781.86 |
|      10 | current |      3 |      49.40 |    3451.53 |  311.10 |      0.849 | 0.635 |      0.047 |            1908.50 |    765.63 |
|      10 | hybrid  |      1 |      54.24 |    2369.66 |  289.53 |      0.801 | 0.587 |      0.052 |             582.18 |    441.96 |
|      10 | hybrid  |      2 |      53.10 |    2387.38 |  289.59 |      0.728 | 0.561 |      0.043 |             585.29 |    441.88 |
|      10 | hybrid  |      3 |      53.93 |    2390.50 |  296.11 |      0.831 | 0.620 |      0.053 |             578.65 |    442.24 |
|      50 | current |      1 |      84.47 |    7760.39 |  388.51 |      0.773 | 0.757 |      0.048 |            6085.48 |   1305.25 |
|      50 | current |      2 |      82.68 |    7708.65 |  365.67 |      1.123 | 0.658 |      0.046 |            6105.28 |   1303.27 |
|      50 | current |      3 |      84.25 |    7700.02 |  365.63 |      1.054 | 1.032 |      0.054 |            6204.54 |   1302.97 |
|      50 | hybrid  |      1 |      90.18 |    3004.03 |  327.41 |      0.835 | 0.543 |      0.050 |            1262.15 |    553.14 |
|      50 | hybrid  |      2 |      89.14 |    3031.95 |  320.71 |      0.920 | 0.675 |      0.063 |            1266.72 |    547.03 |
|      50 | hybrid  |      3 |      93.90 |    3020.14 |  322.27 |      0.884 | 0.653 |      0.050 |            1244.78 |    544.47 |

Command:

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```

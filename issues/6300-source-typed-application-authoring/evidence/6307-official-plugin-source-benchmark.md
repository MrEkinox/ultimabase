# Issue 6307 official plugin source-typing benchmark

This checkpoint measures the completed schema-declaration migration for Access,
Hooks, Validation, ACL, Soft Delete, vector fields, and configured specialized
schemas. The current form uses the same configured application installation path
as production but retains the full generated application declarations. The
hybrid form obtains locally decidable plugin surfaces from source and renders
only the retained cross-schema graph. Each form runs in three isolated,
counterbalanced processes; the table records the mathematical median. Completion,
hover, and cached diagnostic values are warm reads. Times are milliseconds and
heap is MiB.

## Median checkpoint

| Schemas | Form    |  Gen. |    Cold | LS init. | Completion | Hover | Diagnostic | Edit to diagnostic | Decl. bytes | Peak heap |
| ------: | ------- | ----: | ------: | -------: | ---------: | ----: | ---------: | -----------------: | ----------: | --------: |
|       1 | current | 29.03 | 2345.75 |   291.78 |      0.844 | 0.743 |      0.049 |             601.84 |      17,259 |    464.31 |
|       1 | hybrid  | 36.44 | 2294.76 |   289.44 |      0.699 | 0.562 |      0.043 |             408.92 |       2,944 |    442.02 |
|      10 | current | 47.74 | 3467.32 |   312.53 |      0.761 | 0.611 |      0.054 |            1912.80 |     136,265 |    774.95 |
|      10 | hybrid  | 53.76 | 2359.18 |   288.95 |      0.956 | 0.656 |      0.045 |             577.27 |      28,866 |    488.42 |
|      50 | current | 84.35 | 7778.41 |   372.81 |      0.933 | 0.690 |      0.045 |            6034.09 |     660,585 |   1302.84 |
|      50 | hybrid  | 88.58 | 3030.37 |   319.09 |      0.770 | 0.659 |      0.048 |            1262.84 |     143,546 |    546.89 |

Every initial cold and language-service diagnostic count was zero. Every edited
fixture produced exactly one focused diagnostic. At 50 schemas the hybrid form
is 61.0% faster for cold checking, 79.1% faster from edit to complete
diagnostics, 78.3% smaller in generated declarations, 58.0% lower in peak heap,
and 14.4% faster to initialize the language service. Generation is 5.0% slower.
Every warm editor median remains below 1 ms; relative movement at that scale is
timer noise rather than a product regression.

## Evolution

Against the original issue-6301 hybrid proof at 50 schemas, cold checking
changed by +6.4%, edit-to-diagnostic by -12.6%, language-service initialization
by -1.9%, generation by -4.1%, and peak heap by +9.1%. Generated declaration
bytes remain exactly 143,546. The increase in source-side compiler memory is
within the locked budget and now covers the real official plugin callback and
configured specialized-schema contracts delivered by this issue.

Against issue 6306's immediately preceding hybrid checkpoint, cold checking
changed by +4.5%, edit-to-diagnostic by -8.8%, language-service initialization
by -1.8%, generation by -3.2%, and peak heap by +5.6%. Generated declaration
bytes remain identical. Completion, hover, and diagnostic medians changed from
`0.914/0.586/0.055` to `0.770/0.659/0.048` ms. These host-timing observations
do not establish product regressions; the locked comparative budgets all pass.

## Command

```sh
yarn vitest run --disableConsoleIntercept --project performance packages/typegen/tests/performance/hybrid-authoring.performance.test.ts
```

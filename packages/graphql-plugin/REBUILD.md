# `@ultimabase/graphql-plugin` rebuild notes

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Status: work in progress (checkpoint). The compiler half (schema generation,
filters, mutation inputs, bindings, composition, request limits, wire values,
cursor runtime) is rewritten; runtime wiring (`plugin.ts`, `application.ts`,
transport executions) is next.

## Parity oracle used during the rewrite

Besides the test suites, a temporary hook (never committed) appended, for every
application compiled by `yarn vitest run --project unit packages/graphql-plugin`,
the unsorted `printSchema` of the generated and the composed schema, or the
compilation error (`name`, `message`, `reason`, `path`, `owner`). Unsorted SDL
fixes the type-map order and every field order. Baseline (reference tree) and
rebuild dumps (85 entries, 23 of them errors) are byte-identical after sorting
the lines.

# Optional field validation plugin

- Status: completed
- Milestone: 22

## Objective

Milestone 22 extracted only the direct field `validation` option and its
synchronous Standard Schema execution into the optional official
`@ultimabase/validation-plugin` package. Core retains required presence,
nullability, canonical field shapes, defaults, generators, immutable and
generated rules, structural snapshots, decimal precision and scale, and the
mandatory mutation pipeline.

## Completed order

1. Issue 2201 decided the optional field-validation plugin boundary.
2. Issue 2202 added the generic final mutation-input guard boundary.
3. Issue 2203 extracted the complete Standard Schema validation vertical.
4. Issue 2204 verified optional installation and the complete public vertical.

## Outcome

Applications that omit the plugin have no generated `validation` option,
reject untyped use during application compilation, and allocate no application
validator. Installing the plugin restores exact single-pass validation after
all input resolution and before value-dependent enforcement. Reads and result
boundaries retain only Core structural snapshots. Arithmetic validation uses
complete projected values while adapters retain atomic deltas, and Master never
bypasses installed application validation.

The plugin owns Standard Schema compatibility types, execution, issue mapping,
and application-local plans. Zod and Valibot remain test-only interoperability
fixtures rather than production dependencies. Core exposes only the generic
rejection-only Runtime guard and the inert type compatibility surface needed by
independently installed field-option plugins.

## Verification

- `yarn constraints`
- `yarn check:issues` — 1 file and 9 tests passed
- `yarn typecheck`
- `yarn test` — 350 files and 1,703 tests passed
- `yarn lint` — zero errors; reviewed historical line-budget warnings only
- `yarn format:check`
- `yarn build` — every workspace passed declarations, ATTW, and publint
- `yarn test:pack` — 19 files and 98 tests passed
- `yarn test:coverage` — 400 files and 1,856 tests passed, including public and
  PostgreSQL Testcontainers projects, with no type errors

Repository coverage finished at 88.87% statements, 81.71% branches, 94.36%
functions, and 89.03% lines. The validation plugin finished at 87.36%
statements, 77.43% branches, 95.12% functions, and 87.91% lines. Docker was not
visible inside filesystem isolation; the required run outside isolation passed,
so no environment limitation remains.

ACL hardening issues 432 through 435 and generated-schema issue 810 remain in
their independent paused plans.

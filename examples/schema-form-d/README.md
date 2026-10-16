# Schema declaration (form D)

Fixture of [ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md):
three cyclic schemas in separate files (`TodoUser`, `Todo`, `Tag`) declared with
`define({ className, fields })`, thunk relation targets, the `softDelete: true`
and `acl: true` feature keys of `define` (ADR-0339) and a
`.with((plugins) => plugins.access(…).acl(…).hooks(…).postgres(…))` callback,
plus the `Register` declaration for name-keyed types. No generation step runs.

- `src/usage.ts` asserts the inferred query results, inputs and filters;
  `src/typos.ts` holds the eight typo cases, each expected on its own line.
  `src/exactness.ts` holds the acceptance rules of query inputs (rejected and
  accepted selections, inclusions and clauses, ADR-0315).
  `tests/e2e/schema-form-d-types.e2e.test.ts` type-checks both against the
  built packages, and `tests/e2e/schema-form-d.postgres.e2e.test.ts` runs the
  schemas on PostgreSQL.
- `yarn typecheck` checks the fixture against the built packages and the
  package sources.
- `tools/` and `results/` hold the editor probes and the 10/50/200-schema
  measurements recorded for the ADR (TypeScript 6.0.3 and 7.0.2); `tools/gen.mjs`
  writes generated benchmark projects to the ignored `gen/` directory. The
  campaign also needs local probe workspaces outside this repository (the
  TypeScript 7 binary and the TypeScript 7 LSP client); their paths are
  constants at the top of `tools/campaign.mjs`, `tools/probe.mjs` and
  `tools/lsp-bench.mjs`. The Typegen rows of `results/` are historical (Typegen
  was removed in migration step 6.8b).
- `tools/gen-define-with.mjs` writes the same benchmark in the declaration form
  of ADR-0339 (`gen/define-with-<N>/`); `tools/editbench.mjs` interleaves the
  edit-to-diagnostics runs of several generated projects (TypeScript 6 and 7,
  each run gated on a 1-minute load below 4), `tools/measure.mjs` records their
  checker instantiations, and `tools/summarize-editbench.mjs` prints the
  medians.

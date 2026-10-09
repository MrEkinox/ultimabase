# Schema declaration without Typegen

Fixture of [ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md):
three cyclic schemas in separate files (`TodoUser`, `Todo`, `Tag`) declared with
`define({ className, fields })`, thunk relation targets, the `.softDelete()` and
`.acl()` shape methods and a final `.with({ access, acl, hooks, postgres })`,
plus the `Register` declaration for name-keyed types. No Typegen step runs.

- `src/usage.ts` asserts the inferred query results, inputs and filters;
  `src/typos.ts` holds the eight typo cases, each expected on its own line.
  `tests/e2e/schema-form-d-types.e2e.test.ts` type-checks both against the
  built packages, and `tests/e2e/schema-form-d.postgres.e2e.test.ts` runs the
  schemas on PostgreSQL.
- `yarn typecheck` checks the fixture against the built packages and the
  package sources.
- `tools/` and `results/` hold the editor probes and the 10/50/200-schema
  measurements recorded for the ADR (TypeScript 6.0.3 and 7.0.2); `tools/gen.mjs`
  writes generated benchmark projects to the ignored `gen/` directory. The
  campaign also needs local probe workspaces outside this repository (the
  TypeScript 7 binary, the TypeScript 7 LSP client and the Typegen baseline);
  their paths are constants at the top of `tools/campaign.mjs`, `tools/probe.mjs`,
  `tools/lsp-bench.mjs` and `tools/typegen-dump.mjs`.

# Typing cost benchmark

Measures what a developer waits for in the editor (D-12, D-24): the time
TypeScript 7 takes to report the errors of a file, cold and after one edit.

## Tools

- `lsp-edit.ts` starts a fresh `tsc --lsp --stdio`, opens every `.ts` file of a
  project, pulls the diagnostics of one file (`firstMs`), replaces one marker in
  it and pulls them again (`editMs`). It prints one JSON line.
- `tsc -p <project> --noEmit` gives the full cold check time.

## Baseline: the previous base on TypeScript 7

Measured on 2026-10-19 so that the new prototype has something to beat.

- Source: `codex-archive` (`a399235f`), example `examples/schema-form-d`, built
  with `yarn install && yarn build` in a worktree of the tag.
- Projects: `node tools/gen.mjs <N>` for 10, 50 and 200 models (ADR-0339
  declaration form, one `findMany` per model in `src/usage.ts`).
- Edit: `eq: 'valid'` becomes `eq: 42     ` in `src/usage.ts`, which must raise
  exactly one error ("Type 'number' is not assignable to type 'string'").
- Machine: Intel i7-8700B, 64 GB, macOS 15, Node 24.20, TypeScript 7.0.2.
- Three runs, interleaved across sizes; medians below. Load average 3.2 to 3.9.
  Every run checked cleanly (exit 0, 0 errors) and raised 1 error after the edit.

| Models | `tsc --noEmit` | First diagnostics | After the edit |
| -----: | -------------: | ----------------: | -------------: |
|     10 |         498 ms |            286 ms |         225 ms |
|     50 |       1 064 ms |            625 ms |         558 ms |
|    200 |       4 288 ms |          1 975 ms |       1 875 ms |

These agree with ADR-0297 of the previous base (0.55 s at 50 models, 1.90 s at
200 after an edit).

## Prototype

`prototype/` holds the types of `defineModel(...).with(...)`, fields,
relations, queries, model and field rules, two stand-in plugins and
`createApp`; nothing in it runs. `prototype/example/` is a small application
whose `checks.ts` and `declared.ts` assert the types: `tsc` fails if one does
not hold.

`node bench/typing/gen.ts <N> [--field-rules]` writes `gen/proto[-rules]-<N>/`
with the graph and density of the baseline's generator (six scalars, a ring
relation and its inverse, a self relation one model in five, a model `.with`
whose read filter crosses a relation, one `findMany` per model).
`--field-rules` adds a loose field rule and two rules on a declared record,
combined with `anyOf`. On 2026-10-19, `tsc -p` reported 0 errors for
`proto-10`, `proto-50`, `proto-200`, `proto-rules-10` and `proto-rules-200`,
and `lsp-edit.ts` raised exactly one error after the edit on `proto-200` and
`proto-rules-200`.

What the prototype found, and D-44 now records: a field's `.with` is checked
while its model is being typed, so a record type derived from the model is a
cycle. The first form named the model (`.with<'Post'>`, the record read from
`Register`). It held with one rule that destructures `{ record }`, and broke
with two such rules in one `access`, with one annotated parameter (even a
hand-written type), or with a forgotten `: boolean`: `app` became `any`
(TS7022 in `app.ts`), with nothing on the faulty line. TypeScript 6.0.3
behaves the same. A declared record type
(`.with<{ status: 'draft' | 'published' }>`), whose fields `defineModel`
checks against the model's exact types, does not cycle; a mismatch fails on
the field's line and the error shows the model's type.

## Reproducing

```bash
git worktree add ../ultimadatabase-old codex-archive
(cd ../ultimadatabase-old && yarn install && yarn build)
(cd ../ultimadatabase-old/examples/schema-form-d && node tools/gen.mjs 50)
node bench/typing/lsp-edit.ts ../ultimadatabase-old/examples/schema-form-d/gen/form-d-50 src/usage.ts "eq: 'valid'" "eq: 42     "
```

## Comparing

Absolute times move with machine load. When the prototype is measured, run the
previous base again in the same session, interleaving its runs with the
prototype's, and compare those numbers rather than the table above.

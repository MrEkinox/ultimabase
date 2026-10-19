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

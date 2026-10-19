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

## D-12 benchmark

Measured on 2026-10-19, the previous base in the same session, its runs
interleaved with the prototype's; same machine and TypeScript as the baseline.

- Large model: `--wide 120` gives `S0` 120 more scalars (`w0` to `w119`) in
  the cycle of `f0` to `f5`, in a 10-model project. The previous base's
  `tools/gen.mjs` was given the same option locally (its field form has no
  field rules); with `--field-rules`, the prototype adds 20 loose rules and 20
  rules on a declared record to those fields.
- Edits: the query edit of the baseline in `src/usage.ts`, and a model edit in
  `src/s0.ts`, `default: false` becoming `default: 42   ` on `f2`. Each raised
  exactly one error.
- Three runs, medians below, in milliseconds. Load average 2.2 to 2.6. Every
  `tsc -p` exited 0 and every first check reported 0 errors.

| Project                 | `tsc` | Query: first | Query: edit | Model: first | Model: edit |
| ----------------------- | ----: | -----------: | ----------: | -----------: | ----------: |
| Previous base, wide 120 |   646 |          365 |         289 |          423 |         345 |
| Prototype, wide 120     |   210 |           52 |          20 |           45 |          13 |
| + field rules           |   239 |           79 |          46 |           66 |          36 |
| Previous base, 200      | 4 228 |        1 948 |       1 822 |        1 061 |         892 |
| Prototype, 200          |   463 |          320 |         198 |          145 |           7 |
| + field rules           |   596 |          454 |         317 |          152 |          15 |

The prototype holds types only, with two stand-in plugins, where the previous
base type-checks its real packages: the margin is room for the kernel to grow
into, not a final number. Run this campaign again once the kernel's own types
replace the prototype's.

## D-24 spike

D-24 leaves open how a plugin key in `defineModel` that changes the model's
shape is typed: `softDelete: true` adds `trash` and `restore` (D-15, D-17).
Both options are in the prototype, and `prototype/example/plugin-keys.ts`
asserts them.

- Option B, global interfaces: `defineModel` is the kernel's;
  `prototype/plugins.ts` adds each stand-in plugin's keys and commands to
  `ModelOptionKeys`, `ModelWithKeys` and `ModelCommands` (`register.ts`).
- Option A, the plugin set: `prototype/use.ts` gives
  `UltimaBase.use(softDelete(), acl(), postgres({ url }))`, whose
  `defineModel`, `.with` and `create` know only the keys of those plugins.
  Each plugin value carries its types (`prototype/plugin-values.ts`).

Both give `trash` and `restore` only with `softDelete: true`, keep them after
`.with`, and fail on `softDelet` ("Did you mean…"). Only A fails on a key whose
plugin is not used, on the key's line: B accepts the key of any plugin whose
types are loaded, and leaves it to startup.

`gen.ts --app` writes the same projects under option A (`gen/proto-app-*`):
`src/plugins.ts` holds the plugin set and the models call `App.defineModel`.
Every project now also calls `trash.findMany` once per model.

Measured on 2026-10-19, B and A interleaved, three runs, medians in
milliseconds; load average 2.1 to 2.3. Every `tsc -p` exited 0, every first
check reported 0 errors and every edit raised exactly one.

| Project             | `tsc` | Query: first | Query: edit | Model: first | Model: edit |
| ------------------- | ----: | -----------: | ----------: | -----------: | ----------: |
| B, wide 120         |   214 |           56 |          23 |           46 |          14 |
| A, wide 120         |   224 |           57 |          24 |           49 |          15 |
| B, wide 120, rules  |   240 |           80 |          51 |           68 |          36 |
| A, wide 120, rules  |   249 |           83 |          52 |           70 |          37 |
| B, 200              |   509 |          385 |         251 |          148 |           7 |
| A, 200              |   532 |          400 |         267 |          151 |           9 |
| B, 200, field rules |   651 |          498 |         368 |          152 |          10 |
| A, 200, field rules |   657 |          511 |         383 |          156 |          11 |

A costs 1 % to 6 % more, at most 23 ms; both stay far below the previous base.

What else the spike found:

- Since D-44, no type reads `Register`: no model is looked up by name any
  more, and plugin keys come from the plugin set (A) or from the plugins'
  own interfaces (B).
- `caller.user` (D-62) cannot come from the plugin set: the user model is
  declared from it, so it needs a global declaration under either option. In
  a throwaway copy of the prototype, `caller.user` read
  `Register['user']`, declared as `typeof User`. Rules on any model's `.with`
  and field rules on other models were typed exactly (`role === 'admin'`
  fails). A field rule of the user model itself that reads `caller.user`
  cycles unless it declares `: boolean`: without it, `User` becomes `any`
  (TS7022 on its declaration), with nothing on the rule's line.

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

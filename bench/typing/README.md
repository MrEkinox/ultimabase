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

`prototype/` holds the types of the form D-24 settled:
`defineModel({ name, use, fields }).with(...)`, the `fields` callback and its
builders (D-12), relations, queries, model and field rules, three stand-in
plugins defined with `definePlugin` (D-57) and
`defineApp({ database, plugins, models })`; nothing in it runs.
`prototype/example/` is a small application whose `checks.ts`, `declared.ts`,
`plugin-keys.ts`, `define-plugin.ts`, `plugin-own.ts` and `plugin-parts.ts`
assert the types: `tsc` fails if one does not hold.

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

- Option B, global interfaces: `defineModel` is the kernel's; each stand-in
  plugin adds its keys and commands to global interfaces.
- Option A, the plugin set: `UltimaBase.use(softDelete(), acl(), postgres())`
  gives `defineModel`, `.with` and `create` that know only the keys of those
  plugins. Each plugin value carries its types.

Both give `trash` and `restore` only with `softDelete: true`, keep them after
`.with`, and fail on `softDelet` ("Did you mean…"). Only A fails on a key whose
plugin is not used, on the key's line: B accepts the key of any plugin whose
types are loaded, and leaves it to startup.

`gen.ts --app` wrote the same projects under option A. Every project also
called `trash.findMany` once per model. Both options are in commit `ee4a857e`;
D-24 chose A, and the prototype and `gen.ts` now hold only its settled form
(below).

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
  (TS7022 on its declaration, TS7023 on the rule's line).

After D-24, the prototype was aligned on the decision: the database and the plugins
moved to the options of `UltimaBase.create` (D-02), `App.create` became
`App.build`, and the
`postgres` key of `.with` became `graphql`, since a storage adapter is not a
plugin. On 2026-10-19, `tsc -p` exited 0 on the prototype and on the seven
projects `gen.ts` writes (10, 50, 200, rules 10, rules 200, wide 120 with and
without rules), and on `proto-200` and `proto-rules-200` the query edit raised
exactly one error, in 271 ms and 376 ms (one run). D-24 was revisited the next
day (below).

## D-24 revisited

The `App` form needed `app.ts` to exist before any model, and `App.build` to
repeat the models. D-24 now has each model list the plugins it uses,
`defineModel({ name, use: [softDelete(), acl(), graphql()], fields })`, and
one `defineApp({ database, plugins, models })` assemble the application. A
plugin exports two values: its entry in a model's `use` (`softDelete()`),
which unlocks its `.with` key and commands, and its application value
(`softDeletePlugin()`). `defineApp` fails, on its own line, when a model uses
a plugin missing from `plugins`, when a relation points to a model missing
from `models`, and on a wrong `inverse`; `prototype/example/plugin-keys.ts`
and `checks.ts` assert all three.

Measured on 2026-10-20 against the `App` form, on projects `gen.ts` wrote
under each form, three interleaved runs, medians in milliseconds (memory in
MB); load average 1.5 to 3.0. The query edit is the one above, the model edit
`default: false` to `default: 42` in `s0.ts`, the assembly edit removes `S1`
from the models list (`server.ts` under `App`, `app.ts` under A2). Every
first check reported 0 errors and every edit one, except the A2 assembly
edit: two, the unused import and the missing model.

| Project                | `tsc` | Memory | Query: first | Query: edit | Model: first | Model: edit | Assembly: first | Assembly: edit |
| ---------------------- | ----: | -----: | -----------: | ----------: | -----------: | ----------: | --------------: | -------------: |
| `App`, 200             |   565 |    228 |          415 |         280 |          159 |           9 |             359 |            221 |
| A2, 200                |   573 |    229 |          423 |         268 |          174 |           8 |             409 |            255 |
| `App`, 200, rules      |   708 |    294 |          540 |         405 |          162 |          16 |             513 |            372 |
| A2, 200, rules         |   732 |    299 |          559 |         402 |          179 |          16 |             552 |            390 |
| `App`, wide 120        |   249 |    114 |           60 |          25 |           53 |          15 |              68 |             34 |
| A2, wide 120           |   254 |    119 |           58 |          26 |           49 |          16 |              67 |             34 |
| `App`, wide 120, rules |   283 |    128 |           87 |          55 |           73 |          39 |              95 |             61 |
| A2, wide 120, rules    |   302 |    128 |           87 |          53 |           71 |          37 |              97 |             63 |

A2 costs 0 % to 10 % more, at most 50 ms, on the `defineApp` line of 200
models, where the new checks run.

`caller.user` was tried in a throwaway copy: a `signedIn` entry in `use`
carrying the user model's type, read lazily inside `.with`'s signature. It
typed rules exactly, the user model's own rules included, without a cycle;
it was not adopted, since a model should not have to list a plugin to read
its caller.

D-62 chose the `Register` declaration, and the prototype now holds it
(`rules.ts`, `example/user.ts`, `example/caller-checks.ts`). Measured on
2026-10-20 on `proto-rules-200` whose read rules all read `caller.user`, three
interleaved runs on throwaway copies:

| Variant                       | Instantiations | Check time    |
| ----------------------------- | -------------: | ------------- |
| No declaration                |      1 279 233 | 0.648–0.669 s |
| Declaration, rules read `.id` |      1 280 369 | 0.664–0.672 s |
| Declaration, rules read `.f0` |      1 280 384 | 0.661–0.673 s |

Without the declaration, the 200 reads of `.f0` fail, so the declaration is
what types them. The generated projects do not declare it. Two declarations
of different user models in one program fail with TS2717; one `tsconfig` per
application avoids it. Making a field's `.with` non-generic does not remove
the `: boolean` case: the cycle goes through `defineModel`'s inferred fields.

Relation cycles need no registry either. `prototype/example/relations.ts`
queries Author and Book, two models in two files that import each other, and
asserts exact results for `select` and `include` three levels deep, there and
back, and for `where` through the cycle in both directions; a wrong field or
value fails at every depth. Author's and Book's own read rules filter through
the cycle, and their hooks query the other model with a `select` that comes
back: neither model becomes `any`.

A misspelled key next to a valid one passed, found on 2026-10-20: a query's
arguments are inferred, so TypeScript skips the excess-property check (a
misspelled key alone already failed). `prototype/exact.ts` walks the written
arguments against their schema, and `prototype/example/typos.ts` asserts the
error on the key's own line in `where` (scalar, `Date` and relation filters,
`OR`), `orderBy`, `select`, `include`, `findUnique`, `create` and `update`.
The first version mirrored the whole arguments and cost 90 % more check time;
the kept one is `unknown` wherever the arguments fit, and skips types whose
keys are all optional, such as a variable typed `Where<F>`, which would
otherwise be walked through every relation (30 000 instantiations a query).
Three runs interleaved with the previous commit, medians in milliseconds; the
query file holds 400 queries, the "typo" edit writes
`f0: 'valid', f0x: 'valid'`, which raises one error with the check and none
without it:

| Project                 | `tsc` | Memory | Query: first | Query: edit | Typo: edit |
| ----------------------- | ----: | -----: | -----------: | ----------: | ---------: |
| Before, 200             |   636 |    248 |          437 |         266 |        275 |
| After, 200              |   674 |    256 |          534 |         366 |        366 |
| Before, 200, rules      |   749 |    320 |          577 |         400 |        426 |
| After, 200, rules       |   852 |    321 |          663 |         498 |        496 |
| Before, wide 120        |   248 |    118 |           59 |          23 |         23 |
| After, wide 120         |   260 |    120 |           66 |          30 |         29 |
| Before, wide 120, rules |   284 |    131 |           87 |          53 |         54 |
| After, wide 120, rules  |   286 |    131 |           92 |          59 |         60 |

About 0.25 ms a query, 100 ms on a file of 400, still far under the previous
base's 1 875 ms.

A read rule's filter had the same gap for another reason: TypeScript never
excess-checks an object a function returns, and `.with` cannot be generic (it
cycles). The rule now builds its filter with the `where` it receives (D-10),
whose parameter is not inferred, so the native check applies: "Did you mean
to write 'title'?", at any depth and through the Author <-> Book cycle
(`example/checks.ts`). Measured on 2026-10-20 with `tsc --extendedDiagnostics`
against the plain object, three interleaved runs: 902 017 instantiations
instead of 903 409 on 200 models, 1 279 226 instead of 1 280 618 with field
rules, and the same check time within noise.

## D-57: plugin definition

D-57 settled how a plugin is written: an interface extending `PluginTypes`
and `definePlugin<T>({ name, manifest, ... })` checked against it, its
requirements as an object of plugin values (`requires: { auth: authPlugin }`),
and a field's `.with` taking the rules of the model's plugins. For that, the
builders now come only from the `fields` callback, typed by `use`;
`prototype/example/define-plugin.ts`, `plugin-own.ts` and `plugin-parts.ts`
assert the refused cases. Kept as a callback only, a declared record's error
stays on the field's own line; offered next to the object form, it moved to
`fields`.

Three runs interleaved with the previous commit on 2026-10-20, medians in
milliseconds; instantiations and check time from `tsc --extendedDiagnostics`:

| Project            | Instantiations | Check time | `tsc` | Memory | Query: first | Query: edit | Model: first | Model: edit |
| ------------------ | -------------: | ---------: | ----: | -----: | -----------: | ----------: | -----------: | ----------: |
| Before, 200        |        902 026 |        483 |   660 |    195 |          513 |         351 |          183 |          11 |
| After, 200         |      1 046 017 |        515 |   710 |    210 |          501 |         374 |          154 |          17 |
| Before, 200, rules |      1 279 235 |        637 |   850 |    249 |          633 |         481 |          188 |          15 |
| After, 200, rules  |      1 492 947 |        682 |   920 |    266 |          638 |         517 |          165 |          18 |

16 % more instantiations and about 7 % more check time, 35 ms on a query
edit of 200 models. In the spike, a helper instead of the callback cost
1.6 % fewer instantiations; most of the cost is the plugin rules on each
field, not the callback. The `wide 120` projects were not measured.

## Phase 1b: field validation

`validate` takes a Standard Schema or a function (D-23), and `f.json` reads
its schema's output and is written its input (D-53);
`prototype/example/validation.ts` asserts the types and the refusals with
Zod 4.6.5. `gen.ts --schemas` validates `f0` with `z.string().trim().min(1)`
and adds `f6: f.json({ validate: z.object({ ... }) })` to every model: a
worst case, one schema of each kind on each of 200 models. "Zod alone" is
that project with the same two schemas declared in each file but not passed
to `validate`, so it measures what Zod itself costs.

Three runs interleaved on 2026-10-20, "before" being `df67d279`; medians in
milliseconds, load average 3.0 to 4.5. Every `tsc -p` exited 0, every first
check reported 0 errors and every edit raised exactly one.

| Project               | Instantiations | Check time | `tsc` | Memory | Query: first | Query: edit | Model: first | Model: edit |
| --------------------- | -------------: | ---------: | ----: | -----: | -----------: | ----------: | -----------: | ----------: |
| Before, 200           |      1 046 017 |        522 |   729 |    205 |          539 |         375 |          187 |          17 |
| After, 200            |      1 101 603 |        539 |   754 |    207 |          520 |         376 |          158 |          18 |
| Zod alone, 200        |      1 294 114 |        840 | 1 083 |    296 |          534 |         401 |          170 |          25 |
| Schemas, 200          |      1 800 318 |        976 | 1 251 |    342 |          663 |         538 |          176 |          32 |
| Before, 200, rules    |      1 492 947 |        692 |   957 |    260 |          673 |         533 |          195 |          18 |
| After, 200, rules     |      1 542 879 |        720 |   950 |    262 |          648 |         521 |          163 |          21 |
| Zod alone, 200, rules |      1 748 890 |        988 | 1 270 |    352 |          672 |         546 |          179 |          28 |
| Schemas, 200, rules   |      2 318 664 |      1 134 | 1 438 |    403 |          817 |         691 |          179 |          30 |

Without schemas, the new options cost 5 % more instantiations and nothing
measurable in the editor. With them, a query edit takes 140 ms more than
with Zod alone, still far under the previous base's 1 875 ms. Single `tsc`
runs on variants of the 200-model project locate the cost:

- the `f0` schema alone adds 46 000 instantiations, the `json` one 470 000;
- reading Zod's input and output types, without the prototype, adds 51 000;
- a `json` field typed by a function returning a plain object adds 90 000,
  and 228 000 when that function returns `z.output<typeof Settings>`: Zod's
  deferred types cost again wherever records and inputs use them;
- declaring the schema outside `defineModel` changes nothing.

Three attempts gave nothing and were not kept: a Standard Schema type
without its `validate` signature (−0.3 %), a field's options stored without
their schema (0 %), and the schema's types flattened once in the builder
(+2 %).

## Phase 1b: functions

`defineFunction` and `defineApp({ functions })` (D-27, D-45) live in
`prototype/function.ts`; `prototype/example/define-function.ts` asserts each
output form and the refusals. The generated projects declare no function, so
they measure what the change costs models: one `tsc --extendedDiagnostics`
run of each, three times, on 2026-10-20, "before" being `7558694b`.

| Project            | Instantiations | Check time |
| ------------------ | -------------: | ---------: |
| Before, 200        |      1 101 603 |        535 |
| After, 200         |      1 101 777 |        542 |
| Before, 200, rules |      1 542 879 |        704 |
| After, 200, rules  |      1 543 053 |        714 |

174 instantiations more (0.02 %); the check times differ by less than their
spread. Functions at scale are measured with the full benchmark (Phase 1b,
last item).

## Phase 1b: the user model

auth's `defineUser` (D-13, D-62) lives in `prototype/auth.ts`, declared with
the kernel's `ModelFields` and `ModelOf`; `example/user.ts` declares `User`
with it, and `example/caller-checks.ts` asserts that the model lists `auth`
before its own plugins, that `defineApp` asks for `authPlugin()`, and that
`.with` holds only the keys of the plugins the user model uses.

A field rule of `User` that reads `caller.user` was tried in three forms by
editing `example/user.ts`:

| Rule                                                 | Result            |
| ---------------------------------------------------- | ----------------- |
| `caller.kind === 'user' && caller.user.role === ...` | TS7022, TS7023    |
| the same as a ternary                                | TS7022, TS7023    |
| `isEditor(caller)`, declared `: boolean`             | compiles, `tsc` 0 |

The prototype's `defineUser` is declared, not written. A body that calls
`defineModel` with `[auth(), ...use]` returns `[auth] | [auth, ...U]` when
`use` is omitted, and the assertion to `U` fails Oxlint's
`no-unsafe-type-assertion`.

Measured as the functions were, three interleaved runs on 2026-10-20,
"before" being `95be5f89`; the generated projects declare no user model, so
the change is `ModelFields`, `ModelOf` and the auth plugin's types:

| Project            | Instantiations | Check time |
| ------------------ | -------------: | ---------: |
| Before, 200        |      1 101 777 | 575–608 ms |
| After, 200         |      1 102 779 | 575–590 ms |
| Before, 200, rules |      1 543 053 | 706–717 ms |
| After, 200, rules  |      1 544 805 | 697–719 ms |

1 002 and 1 752 instantiations more (0.09 % and 0.11 %); the check times
overlap.

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

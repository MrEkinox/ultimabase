# UltimaBase typing spike (no code generation)

Self-contained TypeScript model of UltimaBase's developer typing, used to test whether
cross-schema relations (P1) and plugin options that need the complete schema type (P2)
can be typed without Typegen. Report (French): [RAPPORT.md](RAPPORT.md).

Everything uses the repository's TypeScript 6.0.3, read-only, through `./tsc`
(`node /Users/mrekinox/Desktop/ub-small/node_modules/typescript/bin/tsc`). Strict options
copied from `ub-small/tooling/tsconfig/base.json` ([tsconfig.base.json](tsconfig.base.json)).

## Layout

| Path | Content |
| --- | --- |
| `lib/types.ts` | Fields, where/select/include, results, writes (model of Core query typing) |
| `lib/core.ts` | Field builder, `UltimaBase.use()`, the declaration form of every variant, registration checks |
| `lib/plugins.ts` | access, hooks, acl, soft-delete, postgres plugins written against Core's generic HKT slot |
| `micro/e1..e12` | Minimal experiments isolating each TypeScript mechanism (`micro/run.sh e1 e2 ...`) |
| `variants/<v>/` | todo-backend-like fixture per variant (User, Role, Todo, Tag; cycles, self relation, many-to-many, access/hooks/acl/postgres) |
| `variants/<v>/probe.json` | Hover markers and one-edit error cases for `tools/probe.mjs` |
| `tools/probe.mjs` | Language-service probe: hovers and diagnostics of each error case |
| `tools/gen.mjs` | Generates N schemas (`gen/<c|d|e>-<N>`) |
| `tools/bench.mjs`, `tools/run-bench.sh`, `tools/summarize.mjs` | Measurements (3 fresh processes per point, medians) |
| `tools/real-baseline/` | Read-only copy of the real Typegen probe, run against ub-small's built packages |
| `scratch/` | Bisection evidence (constraint stack overflow, NoInfer, HKT intersection, toggles) |
| `results/` | Probe outputs, raw JSON lines, summaries |
| `lib-short/` | Section 9: `lib/` plus the one-time application `Register` and name-keyed callback types (`WhereBuilder<"Todo">`) |
| `lib-named/` | Section 9, idea 2: `declare()` returns a named `DeclaredSchema<Name, Fields, AppTypes>` (no gain) |
| `lib-f/` | Section 10, variant F: plugins contribute chained schema methods (`SchemaMethodsHKT`, `SchemaMethod<Args, Fields>`) |
| `short/m1-printing/` | Section 9 printing micro-experiments (named interface, declared class, opaque wrapper, generic callback) |

## Variants

- `a-single-object`: `App.Schema.define({ className, fields, access, hooks })` with exact callbacks (fails).
- `b-single-object-loose`: same object, callback returns loosened to `void` (compiles, weaker checks).
- `c-string-targets`: `target: 'User'` resolved through a developer-declared `Register`, plus `.with()`.
- `d-two-phase`: `App.Schema.declare({ className, fields }).with({ access, hooks })`, `target: () => User`.
- `e-class`: `class Todo extends App.Schema('Todo', (field) => ({ ... })) { static readonly options: Options<typeof Todo> = { ... } }`.
- `e-class-configure`: same class form with `static readonly options = Todo.configure({ ... })`.
- `d9-registry` (section 9): D code on `lib-short/` plus `declare module … { interface Register { readonly app: typeof app } }`.
- `d9-named` (section 9): D code on `lib-named/`.
- `f-plugin-methods` (section 10): the requested F form (`.softDelete().indexes().postgres().access().acl().hooks()`), registry declared; fails (TS7022).
- `f-last-call` (section 10): F with the only cross-schema callbacks in the last call and no registry; compiles.
- `f-factories` (section 10): F plus plugin schema factories (`App.RoleSchema`, `App.PasswordUserSchema`), TodoUser <-> TodoRole.

## Commands

```sh
cd /Users/mrekinox/Desktop/ub-typing-spike
micro/run.sh micro/e1 micro/e2 micro/e3            # mechanisms (expected results in RAPPORT.md)
for v in variants/*/; do (cd "$v" && ../../tsc -p tsconfig.json); done   # fixtures
node tools/probe.mjs variants/e-class               # hovers and error messages
node tools/gen.mjs e 200 && (cd gen/e-200 && ../../tsc -p tsconfig.json --extendedDiagnostics)
tools/run-bench.sh "c d e" "10 50 200" && node tools/summarize.mjs   # full campaign (~10 min)
node --expose-gc --max-old-space-size=12288 tools/real-baseline/probe.mjs 10   # real Typegen baseline
# Section 9 (short D hovers)
node tools/probe.mjs variants/d9-registry > results/probe-d9-registry.md
node tools/probe.mjs variants/d9-named > results/probe-d9-named.md
node tools/probe.mjs short/m1-printing
tools/run-bench.sh "d r" "10 50 200" -s9 && node tools/summarize.mjs -s9   # r = D on lib-short + registry
python3 scratch/rtoggle.py r-200 "update,hooks,acl"   # per-option check-time bisection (after tools/gen.mjs r 200)
# Section 10 (variant F, plugin methods)
(cd variants/f-plugin-methods && ../../tsc -p tsconfig.json)   # expected: TS7022 cycles
node tools/probe.mjs variants/f-last-call > results/probe-f-last-call.md   # hovers, completions, diagnostics
node tools/probe.mjs variants/f-factories > results/probe-f-factories.md
tools/run-bench.sh "d e f" "10 50 200" -s10 && node tools/summarize.mjs -s10   # final lib-f re-run: suffix -s10b
python3 scratch/ftoggle.py f-200 "acl,hooks"   # per-chained-call check-time bisection
```

Check `uptime` before measuring; results are only comparable on a calm machine.

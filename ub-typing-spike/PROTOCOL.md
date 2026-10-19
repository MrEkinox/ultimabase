# Comparison protocol for schema declaration forms (2026-10-09)

The owner of UltimaBase will choose ONE schema declaration form for good, from
evidence. Every form is implemented and checked against the same requirements,
the same probes and the same report template, so results are comparable. The
forms and their developer-facing code are specified in
`/Users/mrekinox/Desktop/ultimadatabase/docs/handoff/formes-a-tester.md`
(read it first; implement each form exactly as shown there, and report any
change you had to make to the developer-facing code).

Context (read before starting): `RAPPORT.md` (sections 1-10) and `README.md`
in this directory; the existing model in `lib/`, `lib-short/`, `lib-f/`; the
variants in `variants/`; the harness in `tools/`. Reuse them: start each form
by copying the closest existing library and fixture.

## Hard rules

- Work only inside `/Users/mrekinox/Desktop/ub-typing-spike/forms/<form-id>/`
  (create it). Do not modify `lib*/`, `variants/`, `tools/`, `micro/`,
  `RAPPORT.md`, `README.md` or another form's directory. If you need a changed
  tool, copy it into your form directory.
- Never touch any git repository. TypeScript only through `./tsc` (repository
  TypeScript 6.0.3, read-only). Same compiler options as `tsconfig.base.json`.
- Core never names a plugin: plugins (access, acl, hooks, soft-delete,
  postgres, roles, password-auth) are written against generic Core slots, as
  in `lib/plugins.ts`. No `any` in Core, plugins or fixture (state any `as`
  cast and why).
- Do NOT run timing benchmarks (`tools/run-bench.sh`, `tools/bench.mjs`):
  another agent measures every form sequentially on a calm machine afterwards.
  A single `./tsc -p ... --extendedDiagnostics` sanity run at 10 schemas is
  allowed; report it as indicative only.
- Stop rule: if a form cannot satisfy a requirement after two comparable
  attempts without new evidence, record the failure with the exact
  diagnostics and move on. A failed form is a valid result.

## Fixture requirements (each form, file `forms/<id>/fixture/`)

Schemas, one file each, todo-backend-like:

1. `TodoUser` (via the PasswordUserSchema factory): `displayName` with a field
   hook `resolveInput` (`value.trim()`), inverse relation `assignedTodos`
   (`mappedBy: 'assignee'`), access filter referencing `Todo` (cross-schema,
   direction User -> Todo).
2. `TodoRole` (via the RoleSchema factory): `members: () => TodoUser`,
   `description`, access filter referencing `TodoUser`, cardinality "exactly
   one" enforced at registration (show the error for a second one).
3. `Todo`: `title` (required, validation), `archived`, `priority` (shared enum
   from `defineEnum('TodoPriority', [...])`), `allowedPriorities` (same enum,
   list), inline local enum `status`, `assignee` pointer to `TodoUser`
   (`onDelete: 'setNull'`), self relation `parent` / `subtasks`, many-to-many
   `tags` with `Tag`; `softDelete` (adds `isDeleted`); access `read` filter and
   `update` filter that crosses to `TodoUser` (direction Todo -> User); ACL
   default granting the role; a hook reading `item.isDeleted`; postgres table
   option and an index.
4. `Tag`: name, inverse many-to-many to `Todo`, access filter that crosses
   Tag -> Todo -> TodoUser (two hops).
5. `app.ts` / `ultimabase.ts`: one plugin list, `new App({ schemas: [...] })`
   (plus `rules` or `Register` only when the form requires it).
6. `usage.ts`: `findMany` with cross-schema `where`, `select`, `include`
   (exact result type asserted), `createOne` with `CreateInput<typeof Todo>`,
   `useMasterKey: boolean` option, a typed `signUp` on the user factory, at
   least 8 exact type assertions and 5 effective `@ts-expect-error`.
7. A tiny runtime stub (`forms/<id>/runtime-check.mjs` or `.ts` run with
   `node`): registering the schemas must expose, per schema, its fields and
   every plugin rule (access, acl, hooks, soft-delete) to the "application",
   proving the form is implementable at runtime (static members, static
   blocks with sealing, rules lists, app-level rules...). Print what was
   collected; it must run without error.

## Mandatory checks and measurements (no timing benchmarks)

Record each in `forms/<id>/RESULTS.md`.

1. Compile: `0` errors for the fixture (`./tsc -p forms/<id>/fixture`).
   TS7022/TS2615/TS2589 anywhere = cycle failure; report it.
2. The 8 typo cases, each applied as a single one-edit change (use
   `probe.json` "errors" like the existing variants, run with
   `node tools/probe.mjs forms/<id>/fixture` or your copy):
   1. relation target typo (`() => TodoUsr`);
   2. local `where` field typo (`'archivd'`);
   3. cross-schema field typo (`'emial'` on `TodoUser` from `Todo`);
   4. plugin-added field typo in a hook (`item.isDeletd`);
   5. `mappedBy` typo (`'asignee'`);
   6. rules/option key typo (`acess`);
   7. wrong filter return (`where: () => 42` or equivalent);
   8. query typo (`select: { titel: true }` in `usage.ts`).
   For each: detected yes/no, on the faulty line yes/no (else where),
   number of diagnostics produced (cascade), full first message and its
   length.
3. Hovers (text and length) at: the `where` builder parameter, the cross-
   schema builder parameter, the hook `item`, the schema constant or class
   name, the rules entry point (`.with(`, `options`, `this.access(`,
   `.rules(`, `rules: {` ...), a `findMany` result.
4. Completion / discoverability: what completion offers at the rules entry
   point (are installed plugins' rules listed?), on `App.` (factories), and
   whether a developer can discover where rules go without documentation.
5. `isolatedDeclarations`: run the Core model and the plugins with it, and
   the fixture; report the diagnostic codes and what the developer or a
   plugin package would have to annotate.
6. JavaScript: does the form work from plain `.js` (runtime stub run on a JS
   copy of one schema file, and `checkJs` diagnostics if relevant)?
7. Plugin author cost: the exact code a plugin author writes to contribute
   (a) a rules entry (access), (b) a shape-changing option (soft-delete),
   (c) a schema factory (RoleSchema); line counts.
8. Developer cost for the fixture: non-blank lines per file, number of
   framework names/concepts the developer must know, how many times each
   schema name is written, any boilerplate per application.
9. Generator for the benchmark: `forms/<id>/gen.mjs <N>` writing
   `gen/<id>-<N>/` with the SAME graph and density as `tools/gen.mjs`
   (read it: 6 scalars, ring `next`, inverse `prevs` with `mappedBy`, a self
   pointer one schema in five, access with a local and a cross filter,
   hooks, acl, postgres, one file per schema, one `findMany` per schema), a
   `tsconfig.json` like the existing generated projects, and compatible with
   `tools/bench.mjs` (read it: same edit marker and file layout). Prove it
   compiles at N = 10 and N = 50 with 0 errors (single run, no timing).
10. Risks and open questions specific to the form.

## Report template (`forms/<id>/RESULTS.md`, in French, ≤ 150 lines per form)

1. Forme (developer code excerpt actually used; differences from the spec).
2. Verdict de compilation (0 error or exact failure).
3. Tableau des 8 fautes.
4. Tableau des infobulles.
5. Complétion et découvrabilité.
6. `isolatedDeclarations` et JavaScript.
7. Coût auteur de plugin / coût développeur (chiffres).
8. Exécution (stub runtime : ce qui est collecté).
9. Générateur (commande, preuve 10/50).
10. Risques.

A family agent with several forms writes one `RESULTS.md` per form and a
short `forms/<family>-SUMMARY.md` comparing them.

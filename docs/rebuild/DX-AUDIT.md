# Editor-visible (DX) parity audit

`tooling/rebuild/dx-audit.mjs` proves, package by package, that what a
TypeScript user sees in an editor is the same in the reference and in the
reconstruction, or lists every difference. "The `dist/index.d.ts` files are
identical except private aliases" is not enough: renaming or inlining a private
alias changes hover and error text without failing any test.

## Running it

Build both roots first (`yarn build`), then:

```sh
node tooling/rebuild/dx-audit.mjs <refRoot> <rebuildRoot> [--out dir] [--only core,hooks-plugin]
```

- `<refRoot>`: a built checkout of reference commit
  `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`; `<rebuildRoot>`: the tree to audit.
- `--out` defaults to `<rebuildRoot>/node_modules/.cache/dx-audit` (never
  committed); `--only` restricts the audit to package directories or groups
  (`tests`, `examples/minimal`).
- Output: `report.json` (every collected difference, machine-readable) and
  `summary.md` (grouped by package and section; identical changes at several
  sites are listed once with all their locations). A full run takes about
  three minutes.

Nothing is written to the audited roots: probe and fixture programs are virtual
files served to the TypeScript language service. Both roots are analyzed with
the auditing repository's TypeScript, so differences come only from the
audited code.

## What is compared

| Section              | Source                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declarations`       | Every top-level statement of the `.d.ts` files reachable from each `exports` `types` entry, keyed by kind and name (private `$1` renames appear as removed + added, with a note). |
| `exports`            | Export names of each entry point and their meanings (value, type, namespace).                                                                                                     |
| `export-completions` | Completions inside `import { \| } from '<package>'`.                                                                                                                              |
| `export-hover`       | QuickInfo (display, documentation, JSDoc tags) of each export at its import specifier, from one probe identical for both roots (union of both export lists).                      |
| `member-hover`       | Every property of exported interfaces, classes (instance and static), object type aliases and object-typed values: declaration QuickInfo, checker type, documentation and tags.   |
| `usage-hover`        | QuickInfo of every identifier at usage sites (below).                                                                                                                             |
| `usage-completions`  | Completions at fixture markers and at every member access of fixtures and examples.                                                                                               |
| `usage-diagnostics`  | Semantic diagnostics (code, category, full message chain, span text, related information) of every usage-site file.                                                               |
| `usage-source`       | The usage-site source itself, so a fixture that differs between roots is reported.                                                                                                |

Usage sites, read from each root:

- language-service fixtures: files matched by
  `git grep -l -E "language-service|getQuickInfoAtPosition|getCompletionsAtPosition" -- packages tests tooling`.
  Embedded sources (string and template literals that import a workspace
  package or a relative module) are evaluated statically; substitutions that are
  not same-file string constants become empty text and are listed in the
  summary. Sources built by `createPublicApiLanguageServiceFixture` are
  reproduced, and on-disk fixture files the tests name (`*.prototype.ts`,
  `*.fixture.ts`, `tests/**`) are included. Marker comments that the test also
  spells as a string are blanked like the repository helpers do.
- type tests: every `*.test-d.ts`, one program per package with its
  `tsconfig.test.json`.
- examples: every file of `examples/*/src`, with the example `tsconfig.json`
  (including the committed generated declarations).

## Normalization (only what users cannot see)

- absolute root paths become `<root>`;
- bundler `//#region` / `//#endregion` lines and source-map comments are dropped;
- declaration order within a file is ignored (records are keyed by name);
- completion entries are sorted (editors order them by `sortText`, which is
  compared), and diagnostics of one file are compared as a sorted list.

Alias names, type text, JSDoc and diagnostic text are never normalized.

## Limits

- Member hovers are taken at the member declaration, which shows the declaring
  type (`(property) Base<T>.name: T`); the checker type is recorded too. A use
  site may show an instantiated variant of the same text.
- Fixture sources computed at test run time (generated typegen output,
  `.join()` of arrays, function parameters) are only partially reproduced; the
  summary lists each such substitution.
- Generator output of `@ultimabase/typegen` is not compared here (the examples
  use their committed generated declarations).

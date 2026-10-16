# define-with codemod

Converts schema declarations to the form of
[ADR-0339](../../../docs/adr/0339-define-describes-with-configures.md):
`define` describes the schema, `.with((plugins) => …)` configures each plugin.

| Before                                                       | After                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `define({ … }).softDelete()`                                 | `define({ …, softDelete: true })`                                         |
| `define({ … }).softDelete({ mode: 'command' })`              | `define({ …, softDelete: { mode: 'command' } })`                          |
| `define({ … }).acl()`                                        | `define({ …, acl: true })`                                                |
| `.with({ access: a, hooks: h })`                             | `.with((plugins) => plugins.access(a).hooks(h))`                          |
| `.with({ indexes: [i] })`                                    | `define({ …, indexes: [...defineIndexes, i] })`                           |
| `RoleSchema.define({ …, ensure, deletion, resolveCurrent })` | `.with((plugins) => plugins.roles({ ensure, deletion, resolveCurrent }))` |

Values, comments and `//#region` markers are copied verbatim, in their order;
only the syntax around them changes. Comments before a shape method move into
`define` with its key; region markers stay where they are. Run Prettier on the
changed files afterwards.

## Usage

```sh
node tooling/codemods/define-with/run.ts [--write] [--report report.json] \
  [--skip <path>]... [--feature <name>]... <file-or-directory>...
yarn prettier --write <changed files>
```

- Without `--write` the command only reports what it would change.
- `.ts`, `.tsx`, `.mts` and `.cts` files are converted whole. In `.md` and
  `.mdx` files, `ts`/`tsx` code blocks are converted, except blocks between
  `<!-- region … -->` and `<!-- endregion -->`: `yarn docs:regions` regenerates
  those from the converted example sources.
- `--feature archivable` also converts a community shape method
  (`.archivable()` becomes `archivable: true`).
- `node_modules`, `dist`, `.next`, `.source`, `coverage` and `gen` directories
  are skipped.

## What it leaves for a manual conversion

It never guesses. Each site below is printed as `file:line kind: code` and left
unchanged:

| Kind                            | Site                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `non-literal-with`              | `.with(rules)`: the object is not written at the call                 |
| `unconvertible-with-entry`      | a spread, computed key or method in the `.with` object                |
| `non-literal-define`            | `define(options)` while a shape method or `.with` indexes must move   |
| `unknown-shape-method`          | a call between `define` and `.with` that `--feature` does not name    |
| `unrooted-with-object`          | `.with({ … })` on a value not written as `X.define(...)`              |
| `unrooted-shape-method`         | `.softDelete()`/`.acl()` on a value not written as `X.define(...)`    |
| `unexpected-chain`              | several `.with` calls, `.with` before a shape method, extra arguments |
| `with-callback-without-plugins` | Role options to move into a `.with` callback with a block body        |

`region-moved` marks a converted site whose `.with` indexes carried region
markers into `define`: check the region still shows what its page expects.

Code built in strings (generators, test fixtures written to disk) is not
parsed: search for `.with({`, `.softDelete(` and `.acl()` in string literals.

## Tests

`yarn vitest run --project unit tooling/codemods`

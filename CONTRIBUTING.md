# Contributing

## Workflow

1. Read `AGENTS.md`.
2. Select one ready issue from `issues/`.
3. Confirm all listed dependencies are complete.
4. Create a focused branch.
5. Implement code, runtime tests, type tests, and documentation together.
6. Run the relevant checks.
7. Add a Changeset when a public package contract changes.

## Definition of done

An issue is complete only when:

- every acceptance criterion is satisfied;
- package boundaries remain valid;
- public exports are deliberate;
- runtime and type-level tests pass;
- relevant README files are current;
- architectural decisions are recorded or linked;
- no unrelated changes are bundled into the work.

## Editor setup

The repository configures VS Code and Cursor to use the TypeScript version
installed by the workspace. After `yarn install`, accept the workspace
TypeScript prompt or run `TypeScript: Select TypeScript Version` and choose
`Use Workspace Version`. This keeps autocomplete and hover behavior aligned
with CI and the generated package declarations.

## Commit guidance

Prefer small commits that explain intent. Conventional Commit prefixes are encouraged:

```text
feat(schema): add enum field inference
fix(runtime): preserve context inside transactions
docs(adr): record role deletion semantics
test(query): cover immutable branching
```

## Pull requests

Describe the issue, architectural impact, tests run, and any temporary compromise. Link the issue file and ADRs.

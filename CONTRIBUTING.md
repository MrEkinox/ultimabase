# Contributing

## Workflow

1. Read `AGENTS.md`.
2. Select one ready issue from `issues/`.
3. Confirm all listed dependencies are complete.
4. Create a focused branch.
5. Implement code, runtime tests, type tests, and documentation together.
6. Record one documentation-impact classification: `none`, `internal
engineering documentation`, `public website documentation`, or `both`.
   Explain `none`; otherwise update the affected documentation in the issue.
7. Run the relevant checks.
8. Add a Changeset when a public package contract changes.

## Definition of done

An issue is complete only when:

- every acceptance criterion is satisfied;
- package boundaries remain valid;
- public exports are deliberate;
- runtime and type-level tests pass;
- relevant README files are current;
- documentation impact is classified, and public behavior, exports,
  configuration, installation, examples, errors, security semantics, and
  supported integrations have been reviewed against `apps/website`;
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

Describe the issue, architectural impact, documentation-impact classification,
tests run, and any temporary compromise. Link the issue file and ADRs. Internal
refactors may classify documentation impact as `none` with a reason; they do not
need meaningless prose changes.

## Public documentation releases

Keep one canonical pre-release documentation line while the repository supports
only the current package line. Versioned documentation becomes necessary only
when the release policy commits to maintaining more than one public release
line concurrently. At that point, create a separate proposal for versioned
routing, search, ownership, and backports. A breaking stable release also needs
a migration guide that explains observable changes; do not duplicate the
current pre-release site in anticipation of that trigger.

Public pages are curated explanations backed by root specifications, package
contracts, public exports, and Runtime behavior. They never replace those
engineering sources or make generated declarations authoritative.

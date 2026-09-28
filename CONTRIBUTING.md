# Contributing

## Workflow

1. Read `README.md` and the README of each package you will change. Coding
   agents must also follow `AGENTS.md`.
2. Select one ready issue from `issues/`.
3. Confirm all listed dependencies are complete.
4. Create a focused branch.
5. Implement code, runtime tests, type tests, and documentation together.
6. Record one documentation-impact classification: `none`, `internal
engineering documentation`, `public website documentation`, or `both`.
   Explain `none`; otherwise update the affected documentation in the issue.
7. Run `yarn validate` for ordinary work and `yarn validate:full` before
   completing a debt reduction or behavior-preserving refactor.
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
- `yarn validate:full` passes for debt reduction and behavior-preserving refactors.

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

Every public page belongs to an explicit release line under
`apps/website/content/docs/<version>`. English is the only authored site
language. Add a new version only when its
framework line has a real public contract to document; never copy the current
line merely to reserve a future number. Keep older version directories frozen
except for corrections and explicitly supported backports. Register new lines
in `apps/website/lib/docs-versions.ts`, and preserve the same relative page path
when a guide exists across versions so the Fumadocs selector can keep the reader
on the equivalent page.

A breaking stable release also needs a migration guide that explains observable
changes between the affected versions. Search, ownership, and
documentation-impact review apply independently to every maintained line.

Public pages are curated explanations backed by root specifications, package
contracts, public exports, and Runtime behavior. They never replace those
engineering sources or make generated declarations authoritative.

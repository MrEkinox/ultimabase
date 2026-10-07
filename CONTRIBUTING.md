# Contributing

## Workflow

This repository rebuilds the reference implementation package by package with
an unchanged public contract. The issue backlog in `issues/`, `docs/plans/`
and `CURRENT_PLAN.md` are the frozen archive of the reference's development:
they explain past decisions but are not a source of new work.

1. Read `README.md` and the README of each package you will change. Coding
   agents must also follow `AGENTS.md`.
2. Read [the rebuild protocol](docs/rebuild/PROTOCOL.md) and the `REBUILD*.md`
   of the packages in scope. Take one scope agreed with the maintainer.
3. Create a focused branch, for example with `tooling/rebuild-worktree.sh <name>`.
4. Implement code, runtime tests, type tests, and documentation together. Keep
   public tests unchanged; record the module mapping, removed checks and
   parity evidence in the package `REBUILD.md`.
5. Record one documentation-impact classification: `none`, `internal
engineering documentation`, `public website documentation`, or `both`.
   Explain `none`; otherwise update the affected documentation in the change.
6. Run `yarn validate` for ordinary work and `yarn validate:full` before
   completing a debt reduction or behavior-preserving refactor. The
   [validation correspondence](docs/rebuild/VALIDATIONS.md) maps every command
   to what it covers.
7. Add a Changeset when a public package contract changes.

## Definition of done

A change is complete only when:

- every agreed criterion is satisfied;
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

Describe the change, architectural impact, documentation-impact classification,
tests run, and any temporary compromise. Link the affected `REBUILD*.md` files
and ADRs. Internal
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

# 005: Finalize lint and formatting

- Status: done
- Milestone: 0
- Packages: repository
- Depends on: 001, 002
- ADR: ADR-0011

## Goal

Make strict typed ESLint and Prettier checks reproducible.

## Acceptance criteria

- [x] ESLint uses project service type information.
- [x] Generated files and build outputs are ignored.
- [x] Tabs, no semicolons, and single quotes are consistent.
- [x] Lint rules do not force arrow functions where public classes are intended.

## Tests

- [x] `yarn lint` and `yarn format:check` pass.

## Implementation notes

- TypeScript ESLint uses the project service for repository code and the dedicated test project for runtime test files.
- Coverage, build output, dependencies, and generated TypeScript files are excluded globally.
- Prettier and EditorConfig agree on tab indentation for TypeScript and JSON while Markdown and YAML retain spaces.
- A temporary stdin fixture confirmed that explicit `any` fails linting and that public class declarations remain valid.
- A temporary stdin fixture confirmed that invalid formatting returns a non-zero status.

# ADR-0036: Colocated package tests

- Status: accepted
- Date: 2026-07-31
- Supersedes: ADR-0035

## Decision

Package source files remain organized by domain, with an explicit root public
manifest and no internal barrel files or published subpaths.

Focused runtime tests and compile-time type tests live beside the source file
whose behavior they protect. Their names use the source stem followed by
`.test.ts` or `.test-d.ts`. A package-level `tests/` directory is reserved for
public-export checks and behavior that spans multiple source domains. Root
`tests/` continue to own behavior that spans multiple packages.

Publishable TypeScript projects exclude colocated tests. Shared Vitest, ESLint,
and test-typecheck configuration discovers both source-local and package-level
test locations, while coverage excludes test modules themselves.

## Consequences

Maintainers can find a source file and its focused tests without navigating a
mirrored directory tree. Renaming or removing one responsibility keeps its
tests visibly adjacent, while cross-domain boundaries remain explicit.

The `src/` tree contains test filenames, but they never enter declarations,
bundles, package archives, or production coverage. Tooling must preserve that
separation whenever a package adopts colocation.

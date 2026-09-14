# 2801: Scaffold the private website application

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: none
- ADR: none

## Goal

Create the private Next.js and Fumadocs workspace that will host the marketing
site and public documentation without changing any publishable framework
package.

## Acceptance criteria

- [x] `apps/website` is a private Yarn workspace with focused development,
      typecheck, lint, and production-build commands.
- [x] Next.js App Router, React, Fumadocs MDX, and Fumadocs UI use mutually
      compatible pinned dependency ranges.
- [x] Separate route groups host marketing pages and documentation in one
      application.
- [x] Product name, canonical URL, repository URL, release status, and global
      navigation are centralized behind typed provisional site configuration.
- [x] Generated Fumadocs and Next.js artifacts are excluded from source control
      and repository checks intentionally.
- [x] Root and application documentation explain local website development and
      validation without changing the publishable package build graph.

## Tests

- [x] Focused website TypeScript and lint commands pass.
- [x] A production Next.js build succeeds from a clean checkout.
- [x] Existing issue metadata and package validation remain valid.

## Completion evidence

- `apps/website` is a private App Router workspace with separate `(marketing)`
  and `(docs)` route groups, one compiled MDX page, Fumadocs layouts, and pinned
  compatible Next.js 16.3.5, React 19.3.0, Fumadocs Core/UI 16.15.10, and
  Fumadocs MDX 15.4.0 dependencies.
- `lib/site.ts` owns the provisional product name, canonical URL, repository
  URL, pre-release status, and typed navigation. No deployment or final naming
  decision is encoded.
- Git, ESLint, and Prettier ignore `.next` and `.source`. A build after moving
  `.next`, `.source`, and the TypeScript build cache out of the application
  regenerated its inputs and statically rendered `/` and `/docs` successfully.
- `yarn website:typecheck`, `yarn website:lint`, `yarn website:build`,
  `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `yarn typecheck`, `yarn test`, `yarn lint`, and `yarn build` pass. The test
  matrix contains 503 files and 2,357 tests; lint reports only the repository's
  existing line-budget warnings.

## Out of scope

- Visual design, final copy, documentation authoring, translation, deployment,
  analytics, a CMS, and a final domain.

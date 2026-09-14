# 2801: Scaffold the private website application

- Status: ready
- Milestone: 28
- Packages: `apps/website`
- Depends on: none
- ADR: none

## Goal

Create the private Next.js and Fumadocs workspace that will host the marketing
site and public documentation without changing any publishable framework
package.

## Acceptance criteria

- [ ] `apps/website` is a private Yarn workspace with focused development,
      typecheck, lint, and production-build commands.
- [ ] Next.js App Router, React, Fumadocs MDX, and Fumadocs UI use mutually
      compatible pinned dependency ranges.
- [ ] Separate route groups host marketing pages and documentation in one
      application.
- [ ] Product name, canonical URL, repository URL, release status, and global
      navigation are centralized behind typed provisional site configuration.
- [ ] Generated Fumadocs and Next.js artifacts are excluded from source control
      and repository checks intentionally.
- [ ] Root and application documentation explain local website development and
      validation without changing the publishable package build graph.

## Tests

- [ ] Focused website TypeScript and lint commands pass.
- [ ] A production Next.js build succeeds from a clean checkout.
- [ ] Existing issue metadata and package validation remain valid.

## Out of scope

- Visual design, final copy, documentation authoring, translation, deployment,
  analytics, a CMS, and a final domain.

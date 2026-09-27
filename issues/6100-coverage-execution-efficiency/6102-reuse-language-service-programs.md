# 6102: Reuse language-service programs

- Status: planned
- Milestone: 61
- Packages: repository tooling, `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 6101
- ADR: none

## Goal

Reduce repeated TypeScript program construction in editor-contract tests while
preserving every completion, hover, diagnostic, source-export, and compiled-
declaration assertion.

## Acceptance criteria

- [ ] Core compact field-signature cases share one language-service program.
- [ ] Access and Hooks completion requests reuse one service whenever they read
      different markers from the same source.
- [ ] Source and compiled-package contracts remain separate where their module
      resolution is intentionally different.
- [ ] Test names and assertion coverage remain independently actionable.
- [ ] Before/after profiles demonstrate a material local time reduction.
- [ ] Complete coverage membership, counters, thresholds, and standard
      repository validation remain intact.

## Out of scope

- Removing or merging distinct editor contracts.
- Sharing a mutable language service across incompatible module augmentations.
- Replacing TypeScript's real language service with mocked types or snapshots.
- Reorganizing PostgreSQL, Create App, performance, or CI integration suites.

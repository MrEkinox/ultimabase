# 013: Repair package CI and the authenticated starter

- Status: completed
- Milestone: 0
- Packages: repository tooling, `@ultimabase/create-app`
- Depends on: 006, 2905, 2906
- ADR: ADR-0251, ADR-0253

## Goal

Fix both failures from GitHub Actions run 35473915026 without skipping tests,
weakening authentication, or changing coverage exclusions and thresholds.

## Acceptance criteria

- [x] Every package discovers its own type tests from its package directory.
- [x] The generated Password Auth and Access combination returns the required
      User profile through the ordinary authorized read pipeline.
- [x] The starter limits User reads to the session owner, denies other schema
      reads, and retains the deny default for mutations.
- [x] Quick Start and the generated and package READMEs describe this explicit
      policy instead of implying that authentication grants Task access.
- [x] Relevant built tests, type checks, lint, documentation, and coverage pass.

## Handoff

- Documentation impact: both. The CI guide documents package configuration and
  discovery parity. Quick Start and initializer READMEs document the generated
  own-profile read policy.
- Six packages inherited root-relative Vitest globs from the repository root
  because they lacked a local configuration. They now reuse the existing shared
  package configuration; the existing parity test checks every package.
- Plugin-owned User schemas cannot declare application-owned inline Access.
  The starter uses the existing attributed Access contribution API, with a
  read fallback narrowed to the exact session owner and explicit denial for
  every other compiled schema. Other operation defaults remain denied.
- Authentication still fails and rolls back if the required profile cannot be
  read. Core, Access, and Password Auth runtime semantics are unchanged.
- Regression checks cover REST sign-up, GraphQL login and refresh, generated
  TypeScript and JavaScript, anonymous and foreign-profile reads, denied writes,
  and Task/Role denial. Generated-project fixtures use distinct usernames.
- Verified 114 targeted unit tests, 16 built initializer tests, 16 type assertions
  across the six repaired packages, repository and initializer test typechecks,
  targeted lint, 66 documentation checks, backlog metadata, and Yarn constraints.
- Full coverage preserves statements (88.81%) and lines (89.37%), and improves
  branches from 81.87% to 81.89% and functions from 94.37% to 94.38% against
  commit 7aa97a62. No previously covered counters in unchanged source files were
  lost; both changed production files retain their prior coverage.
- Scope beyond the reported CI failures: none.

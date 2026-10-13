# ADR-0330: Verified documentation from tested examples

- Status: proposed
- Date: 2026-10-13
- Refines: the website documentation contract (page `sources`, `documentation-ownership.json`),
  the example records (ADR-0249 for create-app templates), ADR-0327 (`testApplication`); applies
  ADR-0288
- Approval: decision 15 of `docs/handoff/api-ideale-decisions.md` ("documentation vérifiée",
  deferred until the API was stable) and the post-migration plan decided by the user on
  2026-10-13; record to be accepted by the user

## Context

The website has about 170 TypeScript code blocks. Pages list their source files in `sources`, and
only the landing samples are compiled by the content tests. Nothing proves that the other blocks
compile or run, so an example can rot silently when the API changes; the migration rewrote most
of the API and relied on manual review to follow it. Package READMEs repeat code from the pages.
The repository has three examples (`minimal`, `todo-backend`, `schema-form-d`) that mix several
features.

## Decision

1. **Every code block is verified or marked.** A TypeScript or JavaScript block on the website and
   in package READMEs is one of:
   - an **included region** of a tested example (`<include>` of Fumadocs MDX from a file with
     `//#region <name>` markers);
   - a **compiled snippet** checked by the content tests against the built packages (Twoslash
     where the page teaches types, otherwise a plain compile check);
   - a block explicitly marked unverified (a meta flag on the fence, for shell output, partial
     pseudo-code or third-party configuration), counted and reported.
     A content test fails on any other block.
2. **One focused example per feature** under `examples/<feature>/` (for example `soft-delete`,
   `access`, `acl`, `roles`, `auth`, `hooks`, `validation`, `relations`, `rest`, `graphql`,
   `testing`): a small complete application in form D, readable on its own, with tests written
   with `testApplication`, run by CI like the other examples. Examples stay few and focused rather
   than one per page.
3. **Package READMEs are copied from example regions** by a script; CI fails when a README is out
   of date with its regions.
4. **Twoslash is adopted only after a prototype** shows that it works with the repository's
   TypeScript versions (6 for the site build, 7 supported), with an acceptable site build time;
   otherwise compiled snippets without hovers are used.
5. **Later**: `create-app --example <feature>` copies an example (a separate record when built).

## Consequences

- Implementation starts with one feature (Soft Delete: example, page regions, README, the
  content test rule), reviewed by the user before the other features follow.
- Tests: the content test classifying every block, region inclusion resolving to existing
  regions, README synchronization, each example's own tests in CI, Twoslash or compile checks.
- Documentation impact: both (every page with code; contributor guide for writing examples).

## Out of scope

Rewriting page prose beyond what the examples require, translations, versioned documentation.

# 6315: Publish one canonical authoring journey

- Status: planned
- Milestone: 63
- Packages: repository examples, initializer, READMEs, public website, engineering documentation
- Depends on: 6313
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make every maintained entry point teach the exact approved application and
schema authoring form, with the retained Typegen relationship boundary and no
alternate installation path.

## Acceptance criteria

- [ ] Root, package, Core schema/plugin, initializer, minimal example, and public website journeys use chained `UltimaBase.use()`, `App.Schema.define()`, explicit schema roots, and direct class commands.
- [ ] No maintained example destructures `Schema` from the configured application or introduces `Schema.use()`.
- [ ] Global plugin defaults and local direct schema-option exceptions are demonstrated without plugin maps or repeated per-schema installation.
- [ ] Plugin-author guidance uses the same Core-native contract with Plugin Kit presented only as an optional convenience layer.
- [ ] Typegen installation, generation, watch, fingerprint, stale-output, and generated-graph documentation accurately describes its sole cross-schema responsibility and does not claim plugin-added surfaces require generation.
- [ ] Migration notes map every removed pre-release form to exactly one replacement and do not promise compatibility aliases.
- [ ] Documentation ownership metadata, source links, initializer snapshots, package archives, and public search content are updated.
- [ ] The current architecture index points only to maintained source-typed contracts.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Initializer generation and runnable packed application E2E.
- [ ] Documentation source, code-block, package-index, and removed-vocabulary guards.
- [ ] Public website validation.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and enumerate every maintained README, example, initializer template, website owner page, architecture index entry, and searchable removed vocabulary.
- [ ] Audit the complete diff for multiple taught forms, inaccurate Typegen/setup commands, invalid code samples, unpublished-package inaccuracies, broken links, missing sources metadata, initializer drift, and documentation that claims undelivered behavior.
- [ ] Record each finding and correction in the handoff; rerun affected runnable examples, website/initializer checks, link audits, and the complete documentation audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; documentation-only edits do not waive product examples, packaging, or `yarn validate:full`.
- [ ] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Publishing packages or deploying the website.
- A second beginner API distinct from the canonical API.
- New product features in examples.

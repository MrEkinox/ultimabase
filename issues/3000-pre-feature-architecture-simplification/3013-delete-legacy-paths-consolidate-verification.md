# 3013: Delete legacy paths and consolidate verification

- Status: planned
- Milestone: 30
- Packages: repository-wide
- Depends on: 3012
- ADR: decisions from issues 3002 and 3003

## Goal

Remove every temporary migration adapter and consolidate repeated conformance
and parity tests without reducing behavioral or coverage evidence.

## Acceptance criteria

- [ ] No legacy application-operation, schema-mutation, application-surface,
      Typegen, transport-planning, multi-application, replacement, decoration,
      or removed privilege path remains in production source or public exports.
- [ ] Official plugins and examples use only the retained public kernel and
      canonical graph contracts; no deep import or private official path exists.
- [ ] Kernel tests prove generic ownership, ordering, lifecycle, security, and
      projection invariants once; plugin suites focus on their product behavior.
- [ ] Shared table-driven fixtures cover direct TypeScript, JavaScript, REST,
      GraphQL, packed, and PostgreSQL parity without duplicate execution of the
      same contract.
- [ ] Coverage includes, excludes, thresholds, and every remaining statement,
      function, branch, and line location are compared before and after test
      consolidation. No production behavior loses its only regression.
- [ ] Package READMEs, public website documentation, examples, architecture,
      roadmap, and plugin-author guidance describe only the retained contracts.
- [ ] CI affected-selection maps the simplified dependencies without adding a
      custom scheduler or silently skipping complete validation.

## Tests

- [ ] Complete typecheck, unit, type, performance, coverage, lint, format,
      constraints, build, package archive, browser, built E2E, and PostgreSQL
      E2E gates pass.
- [ ] Removal searches and public package inventories prove old names and paths
      are absent.

## Audit gate

- [ ] Audit the entire milestone diff for surviving parallel architecture,
      missing regressions, changed coverage locations, stale documentation, and
      accidental public API. Correct and repeat the complete audit and full
      validation until green.
- [ ] Record exact coverage-map comparison, line, file, export, test, duration,
      and Documentation impact evidence before completion.

## Out of scope

- New product behavior or unrelated CI redesign.

# 3031: Reconcile the Core and plugin-authoring website journey

- Status: completed
- Milestone: 30
- Packages: `apps/website`, `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/create-app`
- Depends on: 3030
- ADR: decisions from issues 3002 and 3003

## Goal

Make the public Fumadocs journey explain the simplified application and plugin
model accurately and linearly from installation through plugin authoring.

## Acceptance criteria

- [x] Audit all `core-application`, `project-initializer`, and
      `plugin-authoring-and-tooling` sections from
      `documentation-ownership.json`, plus every page whose `sources` metadata
      names an affected package.
- [x] Update installation, Quick Start, application lifecycle, one-active-app
      behavior, TypeScript and JavaScript flows, Typegen, plugin manifests,
      privileges, capabilities, canonical commands, conformance, and
      troubleshooting wherever the final public contract changed.
- [x] Present concepts in dependency order with one canonical example per task;
      remove stale names, parallel legacy paths, and contradictory examples.
- [x] Preserve the unpublished-package boundary and keep the initializer,
      repository examples, package READMEs, and website claims consistent.
- [x] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [x] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [x] Read the complete journey as a new developer and audit every claim against
      final source and packed exports. Correct and repeat until no stale or
      missing step remains.
- [x] Record reviewed pages and Documentation impact: public website
      documentation.

## Out of scope

- New product behavior or a visual redesign unrelated to comprehension.

## Website reconciliation and final audit

The ownership map and page source metadata select 44 pages (inventory below).
The review checks installation and generated-project parity, Core command and
lifecycle contracts, public plugin boundaries, navigation and adjacent security
and transport claims. The dedicated domain reviews remain 3032 and 3033.

Twelve public pages receive focused corrections:

- Introduction, Quick Start, Manual Installation, release status and package
  reference consistently distinguish locally built repository evaluation from
  the intended registry installation after publication.
- Plugin overview separates repeated plugin instances from simultaneous
  applications. The starter conformance explanation correctly includes resource
  materialization at initialization, without promising infrastructure-free setup.
- Typegen describes one generated registry per TypeScript project and the
  non-activating compilation path. Application tests include existing generated
  declarations and describe the actual two independent test cases.
- Authoring uses one command-selection row; schema-derived inputs precede
  verification and next steps. A custom status route still needs HTTP identity.
- Troubleshooting explains the exact competing-application TypeError, awaited
  disposal, suite hooks, worker isolation and fail-closed cleanup.

The application page, additive schema patches, descriptive Typegen inspection,
capability cardinality/lifetimes, privileges, canonical operation/schema-mutation
paths and immutable data operations already match the final contracts. They
retain their existing examples and public URLs. No Runtime API, package export,
configuration default, migration, security rule or generated artifact changes.
Production delta: zero; the final production total remains 127,096 lines.

Documentation impact: public website documentation.

Validation: Prettier, all 66 content checks across 17 files (11.80 s), website
TypeScript, ESLint and production preview build pass. The first content run
caught the omitted release-feed boundary phrase; it was restored without
weakening its assertion. All 38 focused Chromium checks across four files
pass (33.40 s), covering application/intro navigation, source links, search,
code blocks, responsive layout, light/dark themes and accessibility. Package
exports and unchanged API samples are cross-checked against the final built
packages and their already-passing source/packed contracts. No new package
behavior calls for another production coverage run. All nine backlog checks
pass after handoff. Complete-diff audit is green with no unresolved finding,
new architecture or work beyond the issue criteria.

### Reviewed public pages

Paths below are relative to `apps/website/content/docs/1.0.0`:

- `core/application.mdx`
- `core/data-modeling/defaults.mdx`
- `core/data-modeling/embedded-objects.mdx`
- `core/data-modeling/fields.mdx`
- `core/data-modeling/models.mdx`
- `core/data-modeling/relationships.mdx`
- `core/data-modeling/schemas.mdx`
- `core/data-modeling/virtual-fields.mdx`
- `core/reading-data/filters.mdx`
- `core/reading-data/ordering-and-pagination.mdx`
- `core/reading-data/overview.mdx`
- `core/reading-data/related-data.mdx`
- `core/reading-data/selections.mdx`
- `core/runtime/api-errors.mdx`
- `core/runtime/logical-operations-and-persistence.mdx`
- `core/runtime/runtime-pipeline.mdx`
- `core/security-foundations/master-authority.mdx`
- `core/security-foundations/request-identity.mdx`
- `core/security-foundations/security-model.mdx`
- `core/writing-data/bulk-operations.mdx`
- `core/writing-data/create.mdx`
- `core/writing-data/delete.mdx`
- `core/writing-data/nested-writes.mdx`
- `core/writing-data/transactions.mdx`
- `core/writing-data/update.mdx`
- `core/writing-data/upserts.mdx`
- `guides/generate-types.mdx`
- `guides/test-an-application.mdx`
- `index.mdx`
- `manual-installation.mdx`
- `operations/before-exposing-your-application.mdx`
- `operations/troubleshooting.mdx`
- `plugins/build-a-plugin/index.mdx`
- `plugins/build-a-plugin/operations-and-graphql.mdx`
- `plugins/build-a-plugin/runtime-and-infrastructure.mdx`
- `plugins/build-a-plugin/schemas-and-typegen.mdx`
- `plugins/community-plugins.mdx`
- `plugins/official/password-authentication.mdx`
- `plugins/official/soft-delete.mdx`
- `plugins/overview.mdx`
- `plugins/using-plugins.mdx`
- `project/release-status.mdx`
- `quick-start.mdx`
- `reference/package-index.mdx`

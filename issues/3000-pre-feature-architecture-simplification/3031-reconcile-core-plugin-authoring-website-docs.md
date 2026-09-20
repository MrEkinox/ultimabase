# 3031: Reconcile the Core and plugin-authoring website journey

- Status: planned
- Milestone: 30
- Packages: `apps/website`, `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`, `@ultimabase/create-app`
- Depends on: 3030
- ADR: decisions from issues 3002 and 3003

## Goal

Make the public Fumadocs journey explain the simplified application and plugin
model accurately and linearly from installation through plugin authoring.

## Acceptance criteria

- [ ] Audit all `core-application`, `project-initializer`, and
      `plugin-authoring-and-tooling` sections from
      `documentation-ownership.json`, plus every page whose `sources` metadata
      names an affected package.
- [ ] Update installation, Quick Start, application lifecycle, one-active-app
      behavior, TypeScript and JavaScript flows, Typegen, plugin manifests,
      privileges, capabilities, canonical commands, conformance, and
      troubleshooting wherever the final public contract changed.
- [ ] Present concepts in dependency order with one canonical example per task;
      remove stale names, parallel legacy paths, and contradictory examples.
- [ ] Preserve the unpublished-package boundary and keep the initializer,
      repository examples, package READMEs, and website claims consistent.
- [ ] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [ ] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [ ] Read the complete journey as a new developer and audit every claim against
      final source and packed exports. Correct and repeat until no stale or
      missing step remains.
- [ ] Record reviewed pages and Documentation impact: public website
      documentation.

## Out of scope

- New product behavior or a visual redesign unrelated to comprehension.

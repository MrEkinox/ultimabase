# 2805: Define the public documentation editorial contract

- Status: completed
- Milestone: 28
- Packages: `apps/website`, repository-wide documentation
- Depends on: 2804
- ADR: none

## Goal

Define who the public documentation serves and how tutorials, guides, concepts,
and reference pages communicate before large-scale authoring begins.

## Acceptance criteria

- [x] Primary audiences and prerequisites are explicit for application
      developers, plugin authors, and operators without forcing every page to
      serve all three.
- [x] Tutorials, task guides, conceptual explanations, troubleshooting pages,
      and reference pages each have a concise template and distinct purpose.
- [x] The English voice, terminology, heading style, link language, callout use,
      code-comment style, and product-status vocabulary are documented.
- [x] A bilingual terminology seed records terms that must remain English in
      code and the preferred French wording for public prose.
- [x] Code-sample conventions cover package-manager commands, filenames,
      prerequisites, expected results, secrets, placeholders, imports, and
      validation ownership.
- [x] A source inventory maps current root guides, package READMEs, examples,
      ADRs, and public exports to the target sitemap and marks missing or
      unsuitable source material without copying it automatically.
- [x] Every planned public page has one primary owner, reader outcome, content
      type, release-status expectation, and canonical source of technical truth.
- [x] Page structure favors progressive disclosure and links advanced detail
      rather than front-loading framework internals into beginner journeys.

## Tests

- [x] A documentation metadata check validates page type, audience, status, and
      ownership values before authoring issues consume them.
- [x] Representative page outlines satisfy the editorial templates without
      requiring placeholder public pages.

## Completion evidence

- `apps/website/docs/editorial-contract.md` fixes three reader audiences, five
  distinct page templates, English voice and structure, product-status wording,
  a bilingual terminology seed, code-sample rules, and progressive disclosure.
- `apps/website/content/documentation-plan.json` maps the complete approved
  sitemap and standalone pages to an owning issue, audience, outcome, content
  type, release expectation, source readiness, and canonical repository paths.
- `apps/website/docs/source-inventory.md` classifies root guides, package
  READMEs, examples, public export barrels, ADRs, issues, and tests by suitable
  public use. It records partial production, guide, troubleshooting, status,
  and contribution sources instead of converting them into promises.
- Fumadocs frontmatter now requires audience, content type, reader outcome,
  owner, release status, and repository sources. English and French index pages
  satisfy the expanded schema.
- `yarn website:validate` passes seven content-contract tests, including all
  planned source paths, issue owners, unique routes, frontmatter fields, and one
  representative outline for every page type.
- Website typecheck, lint, production build, browser tests, repository
  constraints, issue metadata, formatting, root TypeScript, and workspace lint
  pass. Workspace lint reports only seven existing file-line-budget warnings
  outside the site.

## Out of scope

- Writing the final pages, choosing a permanent product name, machine
  translation, implementing a CMS, or generating prose from source code.

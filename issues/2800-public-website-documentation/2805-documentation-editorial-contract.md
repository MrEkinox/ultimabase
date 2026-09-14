# 2805: Define the public documentation editorial contract

- Status: planned
- Milestone: 28
- Packages: `apps/website`, repository-wide documentation
- Depends on: 2804
- ADR: none

## Goal

Define who the public documentation serves and how tutorials, guides, concepts,
and reference pages communicate before large-scale authoring begins.

## Acceptance criteria

- [ ] Primary audiences and prerequisites are explicit for application
      developers, plugin authors, and operators without forcing every page to
      serve all three.
- [ ] Tutorials, task guides, conceptual explanations, troubleshooting pages,
      and reference pages each have a concise template and distinct purpose.
- [ ] The English voice, terminology, heading style, link language, callout use,
      code-comment style, and product-status vocabulary are documented.
- [ ] A bilingual terminology seed records terms that must remain English in
      code and the preferred French wording for public prose.
- [ ] Code-sample conventions cover package-manager commands, filenames,
      prerequisites, expected results, secrets, placeholders, imports, and
      validation ownership.
- [ ] A source inventory maps current root guides, package READMEs, examples,
      ADRs, and public exports to the target sitemap and marks missing or
      unsuitable source material without copying it automatically.
- [ ] Every planned public page has one primary owner, reader outcome, content
      type, release-status expectation, and canonical source of technical truth.
- [ ] Page structure favors progressive disclosure and links advanced detail
      rather than front-loading framework internals into beginner journeys.

## Tests

- [ ] A documentation metadata check validates page type, audience, status, and
      ownership values before authoring issues consume them.
- [ ] Representative page outlines satisfy the editorial templates without
      requiring placeholder public pages.

## Out of scope

- Writing the final pages, choosing a permanent product name, machine
  translation, implementing a CMS, or generating prose from source code.

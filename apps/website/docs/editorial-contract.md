# Public documentation editorial contract

This contract keeps UltimaBase documentation concise, verifiable, and useful
while the public API is still pre-release. It applies to public MDX content in
`content/docs`; repository ADRs and implementation plans keep their existing
engineering conventions.

## Readers and prerequisites

Every page names one or more audiences, but it is written for one immediate
reader outcome rather than for everybody at once.

| Audience              | What they need                                         | Assumed knowledge                                                      |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Application developer | Build and operate an UltimaBase application            | TypeScript, Node.js, package scripts, and relational data fundamentals |
| Plugin author         | Extend the application graph through public contracts  | Application-developer knowledge plus TypeScript library design         |
| Operator              | Configure, deploy, observe, and recover an application | Node.js services, PostgreSQL, secrets, and production operations       |

State additional prerequisites before the first action. Link to a prerequisite
page when it already exists; do not repeat its explanation. A page may serve
several audiences only when they share the same outcome.

## Page types

### Tutorial

A tutorial teaches through one complete, working journey. Use these sections:
`What you will build`, `Prerequisites`, `Steps`, `Expected result`, and
`Next steps`. Keep choices fixed so a new reader can finish before learning the
alternatives.

### Guide

A guide helps an informed reader complete one bounded task. Use `Outcome`,
`Prerequisites`, `Steps`, `Verify`, and `Next steps`. Explain decisions only when
they affect the task; link the underlying concept.

### Concept

A concept page builds an accurate mental model. Use `Context`, `Mental model`,
`Boundaries`, and `Related tasks`. Show a small concrete example, but do not turn
the page into a setup walkthrough.

### Troubleshooting

A troubleshooting page starts with an observable failure. Use `Symptom`,
`Cause`, `Confirm`, `Resolve`, and `Escalate`. Put safe, likely checks first and
identify destructive recovery steps explicitly.

### Reference

A reference page is precise lookup material for a public contract. Use
`Signature`, `Parameters`, `Returns`, `Errors`, and `Example`. Document shipped
behavior only and link to concepts for rationale.

## Voice and structure

- Write public prose in English, in direct present-tense sentences.
- Address the reader as “you” for actions. Use “UltimaBase” for framework
  behavior and name the owning plugin when behavior is optional.
- Prefer one idea per paragraph and descriptive sentence-case headings.
- Lead with the reader outcome, then reveal prerequisites, the smallest working
  path, verification, alternatives, and internals in that order.
- Describe what is shipped before why it was designed. Link ADRs only from
  advanced context; an ADR is never the primary learning path.
- Use link text that names the destination or outcome. Avoid “click here”,
  unexplained URLs, and links that merely repeat the current paragraph.
- Use notes for helpful context, tips for safer or faster choices, warnings for
  likely breakage or data exposure, and danger callouts only for irreversible
  or security-sensitive actions. A callout must not replace a prerequisite.
- Keep code comments in English. Explain intent, an invariant, or a security
  boundary; never narrate an obvious line.

## Terminology and product status

Use `pre-release` for behavior that is shipped but may change before the first
stable release. Use `stable` only after the repository explicitly guarantees
the documented compatibility. Use “planned” only on status pages, never as if
the behavior were available. Use “experimental” only when a public contract
defines its support consequences. Prefer “not yet available” to vague future
promises.

Use public API names and package identifiers exactly as exported. Browser page
translation is reader-controlled and is not a maintained UltimaBase language
edition; readers should verify code, security details, and error names against
the authored English page.

## Code samples

- Show `npm`, `yarn`, and `pnpm` install commands in synchronized tabs when the
  command is part of the public package experience. Repository contributor
  commands use the pinned Yarn version only.
- Put the filename above every non-trivial block. Use paths relative to the
  reader's project and keep a consistent example structure across a journey.
- List runtime, database, and preceding-page prerequisites before a command.
- Use imports from published `@ultimabase/*` package exports. Never teach a
  package `src/` path or a repository-only alias.
- Samples must be minimal but executable. Include all imports and surrounding
  declarations required to understand ownership; replace unrelated detail with
  a short named helper, not an ellipsis that hides required behavior.
- Mark placeholders with descriptive uppercase values such as
  `POSTGRES_CONNECTION_URL`. Never publish a working credential, raw Master key,
  or realistic secret.
- Follow a command with the expected observable result and one verification
  step. Do not imply success from the absence of an error.
- Say which layer validates untrusted input. A transport example must not imply
  that HTTP headers, flags, or shaped context can manufacture authority.
- Prefer comments only for non-obvious intent. Put longer explanations after
  the block so the reader can copy the example without deleting narration.

## Frontmatter contract

Every public documentation page declares:

```yaml
title: Build your first application
description: Start a typed application backed by PostgreSQL.
audience:
  - application-developer
contentType: tutorial
outcome: Start and verify a minimal UltimaBase application.
owner: '2806'
releaseStatus: pre-release
reviewedAt: 2026-09-14
sources:
  - examples/minimal/README.md
```

`audience` accepts `application-developer`, `plugin-author`, and `operator`.
`contentType` accepts the five templates above. `owner` is the issue that owns
the page's public contract. `sources` lists the repository paths that must be
checked when behavior changes. `reviewedAt` records the last deliberate review
of the complete page against those sources; it is rendered in the page footer
beside the source-edit link.

The grouped source plan in `content/documentation-plan.json` sets the same
contract before a page exists. `sourceStatus` means:

- `ready`: the current sources are sufficient for accurate public writing;
- `partial`: authoritative behavior exists, but the public synthesis or an
  operational guarantee is incomplete;
- `missing`: no suitable public contract exists yet, even if internal context
  can help define the gap.

Every page also belongs to an explicit release folder at
`content/docs/<version>`. Links inside one version target that exact
version rather than the current-version redirect. Older version folders change only for
corrections or maintained backports; new framework behavior belongs to the
newest supported line.

## Progressive disclosure

Beginner paths introduce only the packages and mental models required for the
next working result. Task guides assume linked prerequisites and avoid
re-teaching them. A coherent subject may combine overview, installation,
configuration, behavior, reference, limitations, and troubleshooting as
sections of one long page. Split only when a reader can complete the resulting
page as an independent task with its own outcome.

### Capability ownership in navigation

The public sitemap makes ownership visible before a reader copies configuration:

- native application, modeling, query, mutation, Runtime, and authority behavior
  belongs below `Core`;
- optional behavior belongs below the exact official or community plugin that
  installs it;
- a Core task page may link to an optional plugin but never duplicate that
  plugin's setup, configuration, reference, or troubleshooting;
- `Guides` contains only workflows that combine several capabilities;
- plugin-specific failures stay with the plugin, while application-wide startup,
  Typegen, and reporting paths stay below `Operations`;
- exhaustive Core signatures, the package index, compatibility, and architecture
  background stay below `Reference`.

Nested navigation is intentional only while it helps a reader choose a subject.
Group by reader decision, capability family, and exact plugin, then move the
plugin's subtasks into the page-level `On this page` navigation. Never repeat a
folder label as a same-named child page. Do not flatten a plugin-owned feature
into `Writing Data`, `Security`, or `Expose APIs` merely because that is where
the reader observes its result.

### Community plugin pages

A community listing records its npm package, maintainer, source repository,
license, supported UltimaBase range, last reviewed version, documentation, and
support channel. It labels the package `Community maintained` and states that a
listing is not a complete security audit, warranty, official maintenance promise,
or endorsement.

Community documentation may be curated on this site, but the maintainer owns
release accuracy, support, security response, and compatibility updates. Do not
publish fictional, unpublished, unmaintained, or unreviewed catalog entries to
avoid an empty state.

When the sources disagree, stop authoring and resolve the public contract in
the owning package or an ADR first. Documentation must describe the repository,
not choose new architecture on its behalf.

## Verification and currency

The ordinary documentation validation checks frontmatter, source paths,
shared samples, package ownership, edit links, and a
small terminology and heading-style ruleset. The same validation runs in CI.
Diagnostics name the affected file and the corrective action.

Mechanical checks cannot decide whether an explanation is complete, whether a
behavioral nuance changed, or whether an example teaches the right boundary.
Every implementation issue therefore records one documentation-impact
classification and reviews the ownership map. Public behavior changes update
the public site in the same issue unless the issue records a concrete reason
that no reader-facing change is needed.

An unavoidable false positive may be listed in
`content/docs-lint-exceptions.json` with its exact file, matched text, and a
specific reason. Broad patterns and undocumented suppressions are not accepted.
The exception is a reviewable escape hatch, not a substitute for clear prose.

Package READMEs, TypeScript declarations, tests, and accepted ADRs remain the
authoritative contracts. Public pages synthesize those sources for readers;
they do not replace or silently contradict them.

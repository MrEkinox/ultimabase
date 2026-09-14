# 2819: Guard public documentation against code drift

- Status: planned
- Milestone: 28
- Packages: repository-wide, `apps/website`
- Depends on: 2806, 2807, 2808, 2809, 2810, 2811, 2812, 2813, 2814, 2815, 2816, 2817, 2818
- ADR: none

## Goal

Make public-documentation impact an explicit part of every relevant code change
so the website does not silently diverge from shipped behavior.

## Acceptance criteria

- [ ] `AGENTS.md` requires every implementation issue to classify its
      documentation impact as none, internal engineering documentation, public
      website documentation, or both before completion.
- [ ] A change to public behavior, exports, configuration, installation,
      examples, errors, security semantics, or supported integrations updates
      the affected public pages in the same issue unless the issue records a
      concrete reason that no public update is necessary.
- [ ] The issue template and contribution guidance include one focused
      documentation-impact checkpoint without requiring meaningless doc edits
      for internal-only changes.
- [ ] A maintainable ownership map connects public framework areas and packages
      to their principal website sections so agents can find likely affected
      pages.
- [ ] Public pages expose a stable source-edit or problem-reporting path and
      meaningful last-reviewed or last-updated information without requiring a
      tracking service.
- [ ] Reusable public code samples are compiled or executed where practical,
      and the boundary between mechanically verified samples and reviewed prose
      is documented honestly.
- [ ] English and French terminology, spelling, heading structure, and common
      prose mistakes receive focused automated checks with documented escape
      hatches for legitimate technical vocabulary.
- [ ] Website content validation runs when public documentation or its shared
      examples change and remains compatible with ordinary repository checks.
- [ ] Contribution guidance defines the release trigger for versioned
      documentation and migration guides without duplicating the current
      pre-release content before multiple supported release lines exist.
- [ ] The guardrail preserves root specifications and ADRs as separate sources;
      it does not make generated website text authoritative Runtime truth.

## Tests

- [ ] Repository tests verify the new issue metadata or documentation-impact
      convention where it is machine-enforceable.
- [ ] A fixture proves that a stale shared sample or invalid documentation
      ownership entry fails with an actionable diagnostic.
- [ ] Edit and report links resolve to the exact content source or configured
      repository issue target.
- [ ] Existing issues are not rewritten merely to satisfy the new prospective
      workflow.

## Out of scope

- Pretending semantic prose drift can be detected completely by automation,
  requiring public doc edits for every internal refactor, generating all prose
  from source, or retroactively auditing every completed issue.

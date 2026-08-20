# 1605: Add evidence-backed plugin authoring helpers

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/plugin-kit`, official plugin packages, `@ultimabase/testing`
- Depends on: 1604
- ADR: ADR-0192, ADR-0202, ADR-0204

## Goal

Remove proven repetitive plugin-authoring boilerplate while keeping privileges,
ownership, peers, capabilities, and contribution identities explicit.

## Acceptance criteria

- [ ] The open-kernel workflow and official plugins are audited for repetition shared by at least two current concrete consumers.
- [ ] Exact plugin factory return types are inferred or expressed through one focused utility instead of maintaining large handwritten `FrameworkPlugin` tuples where inference can preserve the same editor contract.
- [ ] Focused Hooks-extension or Access-provider helpers are added only where two compatible implementations repeat the same safe composition.
- [ ] Operation, model-surface, and Typegen grouping gains a helper only if current consumers repeat all three steps with the same invariant.
- [ ] Every helper keeps privilege names and reasons visible and delegates validation, ownership, provenance, and conflict handling to Core.
- [ ] Language-service hover and autocomplete tests protect the reduced authoring surface from source and packed exports.
- [ ] Rejected helper candidates and the missing evidence for them are recorded so the issue does not generalize for hypothetical plugins.

## Tests

- [ ] Runtime tests prove helpers produce the same owner-attributed declarations and conflicts as their direct Core equivalents.
- [ ] Compile-time tests prove exact options, instances, capabilities, peers, model commands, and Typegen contracts remain inferred.

## Out of scope

- Recreating generic registries, service lookup, or string slots.
- Hiding requested privileges or their reasons.
- Creating another Hooks or Access package.

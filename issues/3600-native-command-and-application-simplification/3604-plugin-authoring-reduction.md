# 3604: Simplify official plugin option and identity authoring

- Status: completed
- Milestone: 36
- Depends on: 3601

## Goal

Remove repeated option-boundary and plugin-identity declarations across the
official plugins while retaining exact diagnostics, inference, and package
contracts. Keep only helpers whose final production delta is negative.

## Result

- Access, Apollo Sandbox, GraphiQL, GraphQL Yoga, and Hono now use Plugin Kit's
  one strict immutable option boundary instead of maintaining independent
  plain-object, allowed-key, and unknown-key loops.
- Apollo Sandbox and GraphiQL keep one package identity fact instead of
  repeating the ID, Core range, and version across both enabled and disabled
  definitions and their public result types.
- The HTTP package now owns reusable browser-bootstrap suffix normalization;
  GraphiQL and Apollo Sandbox no longer duplicate the same decoded-segment,
  reserved-namespace, and normalized-path implementation.
- Public export, TypeScript language-service, Runtime diagnostic, option,
  browser, and package tests protect the unchanged contracts. The stale Soft
  Delete manifest assertion was aligned with 3601's native commands, and two
  `void` value positions were corrected to the exact `undefined` plugin export.

Production changed by 241 additions and 321 deletions (`-80` lines). Tests
changed by 24 additions and 18 deletions (`+6` lines), while documentation and
issue metadata changed by a net `+14` lines. The complete repository suite
passes 2,555 tests across 537 files with no type errors.

Validation:

- `yarn build`
- `yarn typecheck`
- `yarn test` (537 files, 2,555 tests)
- `yarn lint` (no errors; 82 existing line-budget warnings)
- `yarn constraints`
- `yarn website:validate` (17 files, 66 tests)

Documentation impact: both. The package README and plugin-author website guide
document the new HTTP authoring helper; milestone and issue records capture the
internal option and identity consolidation. Existing application-facing plugin
options, defaults, errors, manifests, inference, and Runtime behavior are
unchanged.

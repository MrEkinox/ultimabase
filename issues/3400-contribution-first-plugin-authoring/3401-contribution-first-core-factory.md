# 3401: Introduce the contribution-first Core factory

- Status: completed
- Milestone: 34
- Depends on: none
- ADR: ADR-0270

## Goal

Make one direct `plugin()` call compile one ordered list of nominal
contributions into Core's existing private phases.

## Acceptance criteria

- [x] `plugin()` accepts stable identity, relationships, claims, permission
      reasons, and one ordered contribution tuple.
- [x] Capability providers and requirements, operation and schema-mutation
      contributions, static declarations, and one application resource share
      that tuple without losing their exact types.
- [x] Core derives required privilege names and rejects missing or unused
      permission reasons before any plugin effect.
- [x] Extra callback privileges are attached to the contribution that uses
      them instead of being detached global metadata.
- [x] Static and application phases remain internally separate and application
      resources retain exact lifecycle cleanup semantics.
- [x] Runtime and type tests cover the public generic API and invalid JavaScript
      shapes.

## Handoff

- Documentation impact: both. ADR-0270 records the accepted architecture;
  Core's package contract and the public plugin-authoring introduction now show
  the direct factory, contribution list, inferred permission names, and ordinary
  `ReturnType` plugin typing.
- Validation: Core typecheck, focused ESLint, all 263 Core test files (1,336
  tests), Core build with package export checks, all 17 website validation files
  (66 tests), issue validation, and `git diff --check` pass.
- The legacy factory remains exported only as the explicitly temporary bridge
  required to migrate production plugins and repository fixtures in issues
  3402–3404. It is not a second final contract.

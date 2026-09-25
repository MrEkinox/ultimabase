# 3306: Audit behavioral and authoring parity

- Status: planned
- Milestone: 33
- Packages: repository-wide
- Depends on: 3305
- ADR: ADR-0269

## Goal

Remove temporary authoring bridges, measure the simplification, and prove that
the migration changed no product behavior.

## Acceptance criteria

- [ ] Only one public Core-native plugin construction path remains.
- [ ] No removed Plugin Kit or Core authoring path survives as an alias or documented alternative.
- [ ] The open-plugin fixture demonstrates every retained kernel power with less registration duplication.
- [ ] Before/after source, export, declaration, and authoring-step counts are recorded.
- [ ] Public and engineering documentation show the canonical path exclusively.

## Tests

- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`, `yarn test:e2e:built`, `yarn test:coverage`, `yarn website:validate`, and `yarn check:issues` pass or any unrelated baseline failure is documented with evidence.

## Handoff

- Documentation impact: pending.

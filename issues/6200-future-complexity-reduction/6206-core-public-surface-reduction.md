# 6206: Reduce the unsupported public Core surface

- Status: planned
- Milestone: 62
- Packages: `@ultimabase/core`, official consumers
- Depends on: 6205
- ADR: ADR-0016

## Goal

Remove Core exports that exist only for repository-internal consumers or
superseded construction paths without scattering ordinary developer APIs across
new packages or entry points.

## Acceptance criteria

- [ ] Core exports are classified as developer API, plugin-author API, adapter or transport SPI, or repository-internal detail.
- [ ] Every removed export has a complete consumer audit and no lost capability.
- [ ] Official packages use the same supported boundary available to equivalent community integrations.
- [ ] Root autocomplete remains focused; no speculative package or generic registry is introduced.
- [ ] Public export counts and declaration bytes decrease or every retained exception is justified.
- [ ] Website, README, source, and packed-package public API tests are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Root-export and deep-import guards.
- [ ] Source and packed-package editor contracts.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- Splitting Core into multiple foundation packages.
- Hiding a still-required community integration contract.
- Compatibility barrels for removed exports.

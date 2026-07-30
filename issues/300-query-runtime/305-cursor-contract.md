# 305: Define opaque cursor pagination

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 304
- ADR: ADR-0004

## Goal

Define versioned opaque cursor payloads and stable ordering requirements.

## Acceptance criteria

- [ ] Cursor payloads are signed or tamper-detectable through an adapter boundary.
- [ ] Primary-key tie-breaking is mandatory.
- [ ] Invalid or incompatible cursors produce typed errors.

## Tests

- [ ] Round-trip, tamper, and ordering tests.

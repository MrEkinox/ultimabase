# 305: Define opaque cursor pagination

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 304
- ADR: ADR-0004, ADR-0056, ADR-0057

## Goal

Define versioned opaque cursor payloads and stable ordering requirements.

## Acceptance criteria

- [x] Cursor payloads are signed or tamper-detectable through an adapter boundary.
- [x] Primary-key tie-breaking is mandatory.
- [x] Invalid or incompatible cursors produce typed errors.

## Tests

- [x] Round-trip, tamper, and ordering tests.

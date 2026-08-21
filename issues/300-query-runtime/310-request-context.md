# 310: Define request context and access modes

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/access`, `@ultimabase/runtime`
- Depends on: 201
- ADR: ADR-0013, ADR-0062, ADR-0113

## Goal

Represent request source, authentication, anonymous/user/master access, capabilities, request ID, and metadata.

## Acceptance criteria

- [x] There is no system access mode.
- [x] Raw master keys never enter context.
- [x] Context values are readonly.
- [x] Capabilities use immutable identity tokens rather than transport strings.
- [x] Master construction is omitted from the public API until issue 319.

## Tests

- [x] Runtime, type, immutability, and public-export tests.

## Follow-up

ADR-0113 supersedes the native user mode implemented by this historical issue.
Issue 350 removes that mode and introduces plugin-owned typed request values
while preserving the anonymous and audited-master boundaries.

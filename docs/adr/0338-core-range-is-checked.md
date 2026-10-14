# ADR-0338: A plugin's Core range is checked

- Status: accepted
- Date: 2026-10-14
- Refines: ADR-0190 (protocol compatibility), ADR-0203 (peers); applies ADR-0288
- Approval: chosen by the user on 2026-10-14

## Context

Core checks a plugin manifest's `core` range for syntax only (`validRange`), and Core has no
runtime knowledge of its own version. `core: '^1.0.0'` therefore initializes on Core 0.0.0, while
a peer range that the installed peer does not satisfy is rejected with
`PLUGIN_PROTOCOL_INCOMPATIBLE`. The documentation already showed ranges that would never match.

## Decision

1. Core knows its own version from one source that a test checks against its `package.json`.
2. Graph validation rejects a plugin whose `core` range the installed Core does not satisfy, with
   `PLUGIN_PROTOCOL_INCOMPATIBLE` and a message in the same style as for peers. Prereleases
   follow the same `satisfies` rule as peers.
3. Official plugins declare a `core` range that moves with Core at every release. One source per
   package (its `@ultimabase/core` peer range) feeds the manifest, and a test fails when the two
   differ, so a Core release cannot leave an official plugin behind.

## Consequences

- A community plugin built for another Core major fails at startup with a clear message instead
  of running unchecked.
- Every range in the repository that the installed Core does not satisfy is corrected: packages,
  tests, fixtures, examples, templates and documentation.
- Tests: an accepted range, a rejected range, a prerelease, and the manifest-to-package check of
  every official plugin.
- Documentation impact: both (the build-a-plugin pages, plugin-kit and Core READMEs).

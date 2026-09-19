# GitHub CI hosted validation

Follow-up to ADR-0251 after the first authorized push on 2026-09-19.

The first hosted run exposed missing compiled exports in the website job and
three pre-existing formatting differences among the pushed MDX files. Local
build outputs had hidden the missing job dependency. The unsuccessful run was
cancelled before spending more time on the complete suite.

Website implementation checks now request the shared package build. Repository
documentation checks download that same artifact whenever a build is scheduled.
For documentation-only changes, both build and artifact download remain skipped;
the two landing-example compiler suites are excluded from that content check.
Those suites depend on landing source and compiled package contracts, not MDX
prose, and remain included in package/site changes and full validation. No suite
or assertion is removed, and local commands remain unchanged.

Selection and execution regression tests cover website build requirements,
documentation-only exclusions, and retention of compiled-example validation.
The hosted rerun remains the authority for final timing and outcome.

## Documentation impact: both

This internal handoff records the hosted-only failure and its correction. Three
public MDX pages receive formatting-only corrections; their documented behavior,
examples, and meaning are unchanged. No API, dependency architecture, coverage
threshold, or public configuration is changed.

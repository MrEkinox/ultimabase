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
The hosted rerun passed, including the final required Quality check.

## Hosted measurements

The previous successful CI run,
[35152551626](https://github.com/MrEkinox/ultimadatabase/actions/runs/35152551626),
spent 23 min 57 s in its single Quality job. Its coverage step alone took
14 min 7 s; elapsed workflow time was 24 min. This is a historical reference, not a controlled comparison: the
current revision also includes the initializer and additional tests.

The corrected full run,
[35465557448](https://github.com/MrEkinox/ultimadatabase/actions/runs/35465557448),
uses the following overlapping jobs:

| Check                                   | Duration    | Result |
| --------------------------------------- | ----------- | ------ |
| Selection                               | 8 s         | Passed |
| Shared build                            | 2 min 29 s  | Passed |
| Website                                 | 4 min 11 s  | Passed |
| Root transversal tests                  | 3 min 21 s  | Passed |
| Slowest package (Core)                  | 2 min 55 s  | Passed |
| Complete coverage job                   | 14 min 15 s | Passed |
| Complete workflow, including queue time | 17 min 42 s | Passed |

All 23 package jobs passed. The last package finished 8 min 53 s after workflow
creation. Elapsed workflow time decreases by 6 min 18 s (26.25%) against the
historical successful run. Parallel job durations must not be added to infer
elapsed workflow time.

Complete coverage passed 603 files / 2,742 tests, without type errors. All four
global percentages match the local ownership-pass reference: statements 88.76%,
branches 81.77%, functions 94.34%, and lines 89.31%. No threshold was changed.

This measurement commit changes only this internal Markdown handoff. Its push
also provides a real documentation-only CI sample: package tests, package builds,
browser tests, PostgreSQL, and complete coverage should all be skipped.

## Documentation impact: both

This internal handoff records the hosted-only failure and its correction. Three
public MDX pages receive formatting-only corrections; their documented behavior,
examples, and meaning are unchanged. No API, dependency architecture, coverage
threshold, or public configuration is changed.

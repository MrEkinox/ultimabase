# 701: Resolve lazy relationship schema targets

- Status: ready
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 113, 209, 339
- ADR: ADR-0118

## Goal

Add the application-time schema reference boundary required by pointers and
relations without evaluating circular targets during module initialization.

## Acceptance criteria

- [ ] A relationship declaration accepts a lazy target returning one exact registered schema class.
- [ ] Circular declarations retain precise target inference and resolve only after the application's schemas are registered.
- [ ] Resolution produces one immutable application-local relationship graph without exposing physical database names.
- [ ] Missing, foreign, ambiguous, throwing, or non-schema targets fail before plugin infrastructure starts with actionable schema and field paths.
- [ ] Resolving one application cannot mutate schema classes or leak targets into another application.

## Tests

- [ ] Colocated runtime, type, language-service, and packed-export tests cover direct, circular, invalid, and application-isolated targets.

## Out of scope

- Pointer values, Query inclusion, database storage, relations, and transports.

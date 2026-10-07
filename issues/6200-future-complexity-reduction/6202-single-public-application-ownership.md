# 6202: Converge public application ownership

- Status: completed
- Milestone: 62
- Packages: `@ultimabase/core`, framework consumers
- Depends on: 6201
- ADR: ADR-0276

## Goal

Make `UltimaBase` the sole public owner of application compilation, lifecycle,
and Runtime assembly while preserving every current advanced operation through
focused application-owned APIs.

## Acceptance criteria

- [x] Every consumer of `FrameworkApplication`, `FrameworkEngine`, `RequestEngine`, and their factories is classified.
- [x] An accepted ADR records the canonical public and private boundaries.
- [x] Superseded public construction paths and duplicate lifecycle state are removed rather than bridged.
- [x] Typegen, testing, transports, direct operations, transactions, Master authority, inspection, and disposal retain their capabilities.
- [x] Source and packed-package editor contracts remain exact.
- [x] Public documentation and package README contracts are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Lifecycle and single-active-application regressions.
- [x] Runtime and compile-time public API tests.
- [x] Complete debt-refactor validation gate.

## Out of scope

- A second application container.
- Giving transports an engine or application object.
- Compatibility aliases for removed construction paths.

## Documentation impact

Both. ADR-0276 and the consumer audit record the internal ownership boundary;
Core, Typegen, testing, transport, example, and official-plugin documentation
now teach `UltimaBase` as the sole public application owner. This is a public
construction and inspection API change, so the affected website pages and
package READMEs were updated in the same issue.

## Outcome

`UltimaBase` now owns compilation, initialization, Runtime assembly, request
creation, direct operations, plugin handles, inspection, and disposal. The
public `FrameworkApplication`, `FrameworkEngine`, `RequestEngine`, factory, and
ambient application exports were removed instead of retained as aliases.
Typegen and conformance helpers now accept the same `UltimaBase` object used at
Runtime. The internal application graph and request engine remain private
implementation details, and lifecycle-only applications no longer manufacture
a Runtime when no database adapter is configured.

The migration changed 262 files with 1,713 additions and 1,294 deletions, a net
increase of 419 lines. Most additions are regression migrations across the
existing test matrix and explicit architectural documentation; the product
surface itself loses the parallel public ownership path.

## Validation

- `yarn validate:full`
  - format: all matched files
  - typecheck: every workspace passed
  - ordinary tests: 546 files, 2,591 tests, no type errors
  - lint: 0 errors; existing line-budget warnings only
  - build: every package passed build, API checks, and package linting
  - complete coverage: 621 files, 2,838 tests, no type errors
  - coverage: 90.92% statements (23,714/26,082), 84.45% branches
    (14,698/17,404), 96.08% functions (5,002/5,206), 91.48% lines
    (23,002/25,144)
  - issue metadata: 1 file, 9 tests
  - public documentation validation: 17 files, 66 tests

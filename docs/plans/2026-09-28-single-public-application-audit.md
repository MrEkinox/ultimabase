# Single public application ownership audit

## Scope

This audit records the baseline consumers used for issue 6202 and ADR-0276.
Counts are repository TypeScript-file occurrences at revision `34f3f7fd` before
the migration. They measure change fan-out rather than unique runtime calls.

| Symbol                  | Files | Production ownership             | Retained capability                          |
| ----------------------- | ----: | -------------------------------- | -------------------------------------------- |
| `FrameworkApplication`  |   123 | Core internals, Typegen, Testing | `UltimaBase.compile()` and `initialize()`    |
| `FrameworkEngine`       |    24 | Core Runtime only                | direct methods on `UltimaBase`               |
| `RequestEngine`         |    29 | Core Runtime only                | remains the public request/transaction value |
| `createFrameworkEngine` |    12 | Core Runtime only                | private assembly during `UltimaBase.start()` |

Occurrences of the generic text `createApplication` also include many local test
fixture factories and are not treated as public Core consumers.

## Consumer classification

### Core production

The application kernel owns schema compilation, capability materialization,
plugin setup and lifecycle. The framework engine owns Runtime dependencies and
creates request engines. Both remain private implementation responsibilities.
Core active-scope, relation, mutation, private-storage, callback, and protected
execution modules continue to receive their exact private owner through internal
references.

### Typegen

Typegen needs only pure synchronous compilation and the callback-free graph. It
does not need setup exports, lifecycle mutation, Runtime, request authority, or
an engine. It migrates from `FrameworkApplication` to the immutable result of
`UltimaBase.compile()`.

### Plugin conformance

The testing package needs pure deterministic snapshots, privilege diagnostics,
setup-only initialization, sequential owner replacement, cleanup, and optional
full Runtime startup. One fresh `UltimaBase` supports all of those checks; the
parallel application fixture is redundant.

### Product plugins and transports

Production plugins do not import `FrameworkApplication`, `FrameworkEngine`, or
`RequestEngine`. Password Auth is the sole production consumer of the exposed
`.application` property and uses it only for exact schema ownership and dynamic
plugin lookup. Those operations move to `UltimaBase.ownsSchema()` and overloads
of `UltimaBase.plugin()`. Transports retain ADR-0225's narrow capability.

### Developer examples and documentation

Advanced examples currently use `.application.getPlugin(...)`, `.engine`, and
`generateApplicationTypes({ application })`. They migrate respectively to
`.plugin(...)`, direct request methods, and
`generateApplicationTypes({ ultimabase })`. No operation, transaction, context,
Master, Typegen, or inspection capability is removed.

## Proof obligations

- Pure compilation never acquires the active application slot or opens a resource.
- Initialization keeps the existing slot, setup, failure, and cleanup behavior.
- Runtime is assembled before infrastructure starts when a database adapter is
  configured; lifecycle-only applications start without manufacturing one.
- Request contexts, grants, handles, and engines remain tied to the exact facade.
- Typegen output and source/packed-package editor behavior are byte-for-byte or semantically identical.
- Public exports, examples, package contracts, and website prose expose no superseded bootstrap path.

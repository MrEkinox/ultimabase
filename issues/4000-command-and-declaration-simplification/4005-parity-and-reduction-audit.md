# 4005: Complete parity and reduction audit

- Status: completed
- Milestone: 40
- Depends on: 4004

## Goal

Verify from baseline `aa2f0097` that the milestone removes duplicated Core
mechanics, improves the maintenance side of plugin authoring, and preserves
every supported UltimaBase capability.

## Acceptance criteria

- [x] Public and internal contract changes are enumerated.
- [x] Command, privilege, declaration, schema, Typegen, and lifecycle parity is
      verified.
- [x] Production, tests, documentation, and configuration line changes are
      reported separately.
- [x] Full justified validation and issue checks are accounted for.
- [x] Remaining safe opportunities and rejected over-abstractions are recorded.

## Audit scope

The comparison baseline is commit `aa2f0097`, immediately before milestone 40.
The audit covers the four implementation commits and separates handwritten
production TypeScript, tests, engineering documentation, and configuration.
Generated artifacts are not part of the change.

## Contract inventory

### Public contracts

No public contract changed. The Core root still exports the same four typed
factories:

- `contributeOperation()`;
- `contributeOperationBinding()`;
- `contributeSchemaMutation()`;
- `contributeSchemaMutationBinding()`.

Their option and resource types, generic inference, direct and resource-backed
handlers, cleanup, transport bindings, errors, and Runtime behavior are
unchanged. Schema `add()` and `claim()` registrar methods, plugin privilege
names, conditional activation, and every declaration facade are also unchanged.

### Private contracts

- Operation and schema-mutation contributions now share one private native
  command store, validator, compiler, and canonical command-plan builder. Their
  semantic command kinds remain distinct.
- Exact plain-object and own-key validation now has one private Core owner while
  each caller retains its accepted keys and exact diagnostics.
- A declaration host compiles its active declaration privilege set once rather
  than searching the manifest independently for each facade.
- Schema additions and claims share source normalization and immutable staging,
  while remaining separate lists with separate compilation rules.

The removed operation-to-schema-mutation compilation bridge was not replaced by
a compatibility layer or a generic public registry.

## Capability parity

- **Commands:** direct handlers, resource materialization, cleanup projection,
  contribution identity, bindings, and transport protection remain covered by
  the existing operation, mutation, graph, lifecycle, and transport suites.
- **Privileges:** normalized requests, conditional capability activation,
  denials, exact owner attribution, and effect-time checks remain authoritative.
- **Declarations:** field/schema, model, operation, Typegen-reference, and
  private-storage facades retain their exact privilege gates.
- **Schemas:** additions still create plugin-provided application schemas;
  claims still require an exact root schema. Duplicate checks, diagnostics,
  provenance, static option snapshots, and atomic publication remain distinct.
- **Typegen and lifecycle:** no declaration output, public type reference,
  materialization order, disposal order, or application lifetime changed.

No capability, option, diagnostic, public export, dependency edge, or supported
plugin composition was removed.

## Reduction

Per-commit implementation churn reduces handwritten production TypeScript as
follows. Because later commits touch a few lines introduced earlier, the
baseline-to-final additions and deletions below are slightly lower than this
sum while retaining the same net reduction.

| Issue | Production additions | Production deletions | Net |
| --- | ---: | ---: | ---: |
| 4001 | 649 | 708 | -59 |
| 4002 | 164 | 176 | -12 |
| 4003 | 23 | 36 | -13 |
| 4004 | 33 | 47 | -14 |
| **Milestone** | **869** | **967** | **-98** |

The final diff from `aa2f0097` is:

| Category | Additions | Deletions | Net |
| --- | ---: | ---: | ---: |
| Handwritten production TypeScript | 852 | 950 | -98 |
| Tests | 187 | 6 | +181 |
| Engineering and website documentation | 505 | 35 | +470 |
| Configuration | 0 | 0 | 0 |
| **All files** | **1,544** | **991** | **+553** |

The positive all-file net is entirely tests and documentation. Runtime and
authoring implementation decreases by 98 lines.

## DX assessment

The milestone improves plugin-authoring maintainability rather than changing
the public authoring vocabulary. Authors keep the same short, typed factories
and do not need a migration. Core contributors now have one implementation to
extend or fix for both native command kinds, one exact-object primitive, one
compiled declaration-access view, and one schema-source staging path. That
reduces the chance that two authoring paths drift in validation, lifecycle, or
diagnostics.

The improvement is therefore real but indirect for an external plugin author:
there are fewer internal paths behind the same API, not fewer public concepts
or keystrokes in plugin source. Claiming a larger immediate DX improvement
would overstate this milestone.

## Remaining safe opportunities

1. Review the 466-line private `plugin-contributions.ts` split between public
   contribution contracts and Runtime storage/normalization. Proceed only if a
   concrete extraction reduces production code without adding another bridge.
2. Reduce the 433-line schema declaration registry by extracting one existing
   cohesive commit/snapshot or option-staging responsibility. Do not merge the
   field, model, schema, and private-storage registries into a generic registry.
3. Audit lifecycle materialization and cleanup planning inside the 554-line
   capability host. Its privilege and ownership checks are a security boundary,
   so any change needs focused failure and teardown-order tests.
4. Keep the remaining Core field-builder `Object.keys()` validator separate
   until symbol-key rejection is an explicit behavior decision. Reusing the new
   `Reflect.ownKeys()` helper today would alter accepted input.
5. Keep PostgreSQL package-local option validation out of Core's private helper.
   It should be consolidated inside the PostgreSQL package only if another real
   consumer proves local duplication.

## Rejected over-abstractions

- No generic public command contribution factory: operation and schema mutation
  have different public meaning and Runtime semantics.
- No generic declaration registry: the existing registries enforce different
  ownership, privilege, publication, and conflict invariants.
- No exported validation framework: the shared exact-object helper is a private
  implementation detail, not a new plugin-author concept.
- No compatibility facade: public APIs did not move, so a bridge would only add
  code and a second path.

## Validation

- `yarn typecheck` passed.
- `yarn test` passed: 538 files and 2,561 tests, with no type errors. The first
  sandboxed attempt failed only because HTTP tests could not bind localhost;
  the unrestricted rerun passed.
- `yarn test:coverage` passed: 613 files and 2,808 tests, with no type errors.
  Coverage is 90.67% statements, 84.10% branches, 95.90% functions, and 91.28%
  lines.
- `yarn lint` passed with zero errors and the repository's existing line-budget
  warnings.
- `yarn build` passed, including package export checks.
- `yarn website:validate` passed: 17 files and 66 tests. Its first run exposed
  stale page-source metadata for the two removed command files; the metadata now
  points at the canonical command contracts, implementation, and plan.
- `yarn check:issues` passed: 9 tests.
- `git diff --check` passed.

## Documentation impact

Classification: **both**.

This audit, the milestone, and `CURRENT_PLAN.md` describe private Core
consolidation. Public prose and behavior remain unchanged. The Operations and
GraphQL authoring guide's source metadata now follows the renamed canonical
Core files so automated documentation provenance remains valid.

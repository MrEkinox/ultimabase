# 3008: Compile one canonical command graph

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/core`
- Depends on: 3007
- ADR: ADR-0259, refined by ADR-0261

## Goal

Create one immutable compiled command representation from which execution,
developer surfaces, Typegen, and transports can derive least-authority views.

## Acceptance criteria

- [x] One discriminated command graph represents application operations,
      request-authority schema mutations, and private Master administration
      without merging their distinct execution semantics.
- [x] The graph has two closed kinds: application operation and schema
      mutation. Master administration is a mutation with Master authority;
      retired arbitrary schema/model operation targets are not reconstructed.
- [x] Each command records one canonical identity, owner, version, target,
      authority, payload and result facts, public errors, selected surfaces, and
      transport metadata at their respective compilation/materialization phases.
- [x] Each graph field is justified by a current execution invariant or at least
      two current projections; owner-private single-consumer facts remain local
      unless centralization enforces one named invariant.
- [x] Executable callbacks and codecs remain private owner-bound references;
      immutable compiled and transport projections contain only their required
      inert facts.
- [x] Duplicate names, owners, targets, surfaces, protocols, and bindings fail
      at their canonical boundary: static declarations compile atomically;
      application binding facts are validated when their factories materialize.
      Migrations 3009–3012 remove each consumer’s obsolete validation and state.
- [x] Core command compilation contains no product, Access, Hooks, REST,
      GraphQL, Yoga, database, or Typegen vocabulary.
- [x] Existing operation and schema-mutation APIs temporarily adapt into this
      graph only for the bounded migrations in issues 3009 through 3012.

## Tests

- [x] Graph compilation covers ownership, ordering, immutability, collisions,
      malformed JavaScript, multiple retained plugin instances, private
      callbacks, deterministic fingerprints, and application disposal.
- [x] Public exports remain limited to the accepted plugin-author contract.

## Audit gate

- [x] Audit the compiled graph for duplicated facts, leaked executables,
      product vocabulary, speculative fields, renamed generic registries, and
      parallel validation. Correct and repeat until every fact has one owner and
      one source of truth and the accepted complexity budget is met.
- [x] Record graph shape, line, file, test, and Documentation impact evidence
      before completion.

## Out of scope

- Migrating a production operation or transport and removing legacy adapters.

## Approved phase refinement

The initial audit found that transport metadata is produced by retained
application-lifetime binding factories, including both Soft Delete bindings.
A public-export probe confirmed compile/create/dispose counts of 0/1/1 across
pure compilation, initialization and disposal. Running factories during pure
compilation would change resource ownership and privilege timing.

The user explicitly approved ADR-0261: immutable static declarations first,
then owner-bound execution references and immutable binding metadata during
materialization, before consuming transport projections. No public authoring
API changes. This resolves the recorded stop without rewriting ADR-0259.
The consumer migrations remain bounded to issues 3009–3012.

## Implementation and audit notes

The graph has two closed record variants: operation and mutation. Name/version,
exact owner and immutable contract facts are compiled once. Mutation aliases
carry their validated schema name, original contribution order, selected handle
surfaces and retained static options. Source tokens and executable references
stay private. Runtime handler and codec ownership now belongs to the graph's
application binding phase; the operation and mutation Runtime classes no longer
own handler/binding registries or repeat those ownership checks.

The existing handle, Typegen and transport facades are bounded derived adapters,
not independent registrars. The adapters retain command object identity because
request envelopes compare exact compiled objects. Defensive copies of their Map
indexes cannot mutate canonical records. Remaining payload/execution and public
projection migrations are still issues 3009–3012; no concrete plugin operation,
transport plugin or plugin-author API was migrated in this issue.

Each retained fact has a current reason:

- Identity, structured owner and version bind the exact handler and codec and
  drive current surface and transport projections.
- Input/result nominal references and public errors preserve the existing
  contracts; executable snapshotters never enter the inert canonical records.
- Transaction policy remains operation-specific; mutation authority, effect,
  selection and returning phase remain mutation-specific.
- Target names, aliases, contribution order and static options preserve existing
  handle identity/order and declarations. The order index prevents regrouping
  by operation declaration from reordering surface contributions.
- Late protocol/metadata values belong to exact canonical records only after
  resource factories return. Partial batches publish nothing; cleanup and
  disposal revoke private bindings. Dormant mutation providers remain dormant.

Audit corrections made before completion:

1. Initial derived views recreated command wrappers, violating the existing
   envelope identity guard. Stable derived wrappers restore identity without
   independent facts or registration; operation/mutation Runtime regressions pass.
2. Surface projection initially regrouped aliases by declaration order and
   rescanned all aliases for every schema. A single ordered pass now preserves
   contribution order without that repeated scan; the new graph test deliberately
   declares commands and attaches aliases in opposite orders.
3. Full lint exposed missing explicit Node globals in the prior single-worker
   JavaScript fixture. Importing `process` and `URL` makes the existing fixture
   lintable without changing its lifecycle behavior. This is the only supporting
   correction outside the graph's original implementation files, alongside the
   GraphQL regression assertion updated for the approved earlier owner check.
4. The old `CompiledPluginSchemaMutation` wrapper became unused; its internal
   declaration and barrel export are removed. Public package exports are unchanged.

The source audit finds no old Runtime handler/transport maps, parallel owner
comparison in the planners, or separate compiled operation/schema-surface
registries. The graph adds no public registration API, generic capability,
concrete plugin vocabulary or generated executable state. The retained nominal
type-reference metadata uses existing contracts, without Typegen implementation
logic or a dependency on the Typegen package.

Documentation impact: both.

The Core README and website plugin-author operation guide document resource-free
compilation and initialization-time binding validation. ADR-0261, the active and
detailed plans, and the affected migration issues record the approved phase
clarification. No endpoint, payload, return shape or plugin factory signature
changes. A duplicate/foreign binding now fails at materialization before a
transport can obtain its plan, instead of being discovered by later consumers.

## Validation and final audit

The final audit has no unresolved finding. No additional public capability or
product feature was introduced. Boundary adapters into the canonical binding
store replace duplicate Runtime/planner ownership validation now; issues
3009–3012 retain their payload, logical execution and projection cleanup scope.

- `yarn typecheck`: passed.
- `yarn build`: passed (35.988 seconds); final Core rebuild also passes `attw`
  and `publint` after the last structural cleanup.
- `yarn test --maxWorkers=2`: 533 files / 2,529 tests passed, zero type errors,
  153.45 seconds. This final run follows the corrected GraphQL owner assertion.
- `yarn test:e2e:built --maxWorkers=2`: 97 files / 379 tests passed,
  152.52 seconds, including PostgreSQL, JavaScript, packed exports/editors,
  Password Auth, Soft Delete and transport behavior.
- `yarn lint`: passed; affected final files also pass targeted lint. Existing
  warning-only file-size notices remain; no baseline or limit was increased.
- Website validation: 17 files / 66 tests passed, 14.58 seconds.
- Constraints, issue metadata, formatting and diff checks pass.
- The first sandboxed broad run could not open loopback listeners and overlapped
  a build while package fixtures resolved exports. Final broad runs used the
  permitted local-server environment and stable completed build artifacts.
- Complete coverage was not rerun; exclusions, thresholds, timeouts and CI
  configuration are unchanged. Local durations are not controlled CI estimates.

The existing measurement script reports 701 production TypeScript files /
127,897 lines, including Core's 336 files / 68,724 lines: **+3 files and +100
production lines** from issue 3007. TypeScript test/support code adds 418 lines
and one file. The graph foundation adds these lines while removing the former
independent declaration and Runtime binding stores. Public exports remain
**1,726**, and built declaration size remains **858,344 bytes** across packages.

The quiet 20-lifetime no-product sample reports median startup/read/mutation
**1.669 / 0.417 / 0.510 ms**, with heap medians of 8,971,152 / 9,996,976 /
10,193,600 bytes. It exercises no plugin command or transport and establishes
no claimed speedup. Measurement revisions identify the preceding HEAD plus
this issue's working tree; exact full-commit line counts are reported after
creating the dedicated commit, including all tests and documentation.

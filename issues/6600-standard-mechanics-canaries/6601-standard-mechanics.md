# 6601: Test field collection and repository discovery

- Status: completed
- Milestone: 66
- Packages: graphql-plugin, website, repository tooling
- Depends on: 6502
- ADR: 0238, 0275, 0287

## Goal

Test GraphQL Tools field collection, then native Node globbing. Screen Manypkg
workspace discovery last. Retain only worthwhile, behavior-preserving changes;
otherwise remove the experiment and record the concrete reason.

## Working context

- Scope: GraphQL selection collection and the identified repository/documentation
  file and package inventory helpers. No schema/API/Runtime/Typegen changes.
- Current contracts: [GraphQL README](../../packages/graphql-plugin/README.md),
  ADR-0238 selection/validation boundaries, ADR-0287's existing dependency,
  existing GraphQL normalization and website/documentation guard suites.
- Locked decisions: preserve relationship projections and errors, directive and
  alias behavior, explicit validation before Runtime, exact discovered files,
  deterministic ordering and the existing Node 24.0 floor. No new public helper.
- Rejected approaches: previous package trials remain rejected; do not revisit
  numeric arithmetic, Markdown parsing, process wrappers or native maxTokens.
  Reopen native discovery only after proving hidden-path/symlink/error parity
  without a larger bridge. Reopen Manypkg only with a package-only strict
  discovery boundary or explicit approval to broaden the validation scope.
- Proof commands: focused GraphQL unit tests and root typecheck; website-content
  and documentation guards; rebuilt GraphQL packed/transport checks if retained;
  then permissioned `yarn validate:full` before retention/commit.
- Exploration budget: two comparable failed variants or 30 minutes without
  verifiable progress per candidate, excluding validation waiting.
- Next action: none; GraphQL retained and fully validated, discovery replacements
  rejected. No push authorized.

## Canary evidence

- GraphQL: the original normalizer passes new characterization cases for repeated
  named fragments, conditional variables, inline fragments, merged pointer fields
  and combined connection nodes/edges. The candidate passes the same expectations
  and all 123 GraphQL unit tests (21 files). Networkless string/parsed documents
  reject missing/cyclic fragments and conflicting aliases before resolver work.
- Use public `collectFields` with an explicit unknown-valued variable generic
  and the actual runtime object type. Keep Core projection/relationship/pagination
  logic, flat delete/upsert restrictions and pre-Runtime document validation.
  Production diff: 37 added / 82 removed, net -45; no dependency/export change.
- Native discovery: `globSync('**/*.mdx')` finds the same 57 current pages, but
  drops nested hidden paths and includes a directory named `folder.mdx` unless
  adapted. It returns an empty result for a missing root instead of `ENOENT`.
  A second variant, recursive `readdir` with Dirents, includes hidden
  paths but follows directory symlinks that the current walkers do not traverse.
  Preserve the current walkers; do not add a discovery compatibility bridge.
- Manypkg 1.1.3: the installed Changesets dependency returns 26 workspaces and,
  after filtering, exactly our 23 packages. It rejects a missing name in an
  unrelated application workspace before package filtering and accepts numeric
  package names. Retaining our scope/diagnostics/type validation would keep an
  adapter. The current upstream 3.1.0 implementation still validates all
  workspaces before filtering and uses the same truthy-name check
  ([source](https://github.com/Thinkmill/manypkg/blob/main/packages/get-packages/src/index.ts)).
  It has two direct dependencies rather than the installed version's six;
  the boundary mismatch, not that old dependency count, rejects this canary.
- Initial characterization fixture failures were corrected on the original code:
  selection order must match the source; networkless checks need a started
  application rather than the normalization-only fixture. The new networkless
  fixture also uses the existing explicit GraphqlApplication type. No failing
  expectation was changed to accommodate the candidate.
- Root `yarn typecheck` and focused ESLint pass. Baseline coverage is the prior
  full gate at 3f72513b; the subsequent HEAD commit changed documentation only.
  Raw fixtures and the copied baseline live under
  `/private/tmp/ultimabase-mechanics-canaries.KXTypC`.

## Final audit and validation

- `yarn validate:full`: exit 0. Ordinary suites: 560 files / 2,683 tests;
  coverage suites: 639 files / 2,947 tests, no type errors. Issue checks: 22 tests;
  website checks: 66 tests. Formatting, lint, builds, export checks and constraints
  pass; existing line-budget warnings remain, with no new warning in these files.
- `yarn vitest run --project e2e --project postgres-e2e --maxWorkers 1` on the
  GraphQL schema-execution, Yoga application and PostgreSQL cross-transport parity
  files: 3 files / 4 tests pass against rebuilt exports. Infrastructure checks
  used the required permissions from their first run.
- Coverage: statements 23,778/26,080 = 91.17%; branches 14,695/17,358 = 84.65%;
  functions 5,012/5,193 = 96.51%; lines 23,055/25,135 = 91.72%. Before:
  91.12%, 84.61%, 96.49%, 91.68%, respectively. Same 729 production files,
  unchanged exclusions/thresholds, no coverage loss in any unchanged file.
- Audit: no Core/Runtime/Typegen/public export change, no new dependency or
  compatibility facade. Preserve selection order, aliases/directives, relationship
  errors and restrictions, pagination, immutable Core ASTs and safe request entry.
  Removed collector guards duplicate the existing validated-document precondition;
  both string and parsed request paths retain their errors before resolver work.
- Production TypeScript: 37 added / 82 removed, net -45. Tests: 105 added /
  1 removed, net +104 (five new cases). Total TypeScript: net +59, not a net
  repository line reduction. No source change from either rejected canary.
- Reviewed the public GraphQL website guide's selection and mutation descriptions:
  still accurate; the internal collection change needs no public documentation edit.
  No remaining audit finding; the final local commit is inspected before handoff.

## Documentation impact

Internal engineering documentation. Updated the package README and reviewed
public GraphQL prose; no public edit is needed because its contracts stay accurate.

## Acceptance criteria

- [x] Compare actual GraphQL consumers and exact validation/projection behavior.
- [x] Compare native file discovery, including hidden paths, symlinks and errors.
- [x] Record net changes and dependency costs; remove unhelpful experiments.
- [x] Audit the retained diff, pass full validation and inspect a local commit.

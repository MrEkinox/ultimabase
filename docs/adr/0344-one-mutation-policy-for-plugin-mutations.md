# ADR-0344: Plugin mutations share the native policy stages

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0245 (plugin schema mutations), ADR-0306 (readable mutation results), ADR-0316 decision 6 (many-row
  plugin commands), ADR-0317 (Access rules); applies ADR-0288
- Approval: change-amplification audit and mutation-path investigation of 2026-10-17; cleanup programme approved by the
  user on 2026-10-17; record accepted by the user on 2026-10-17

## Context

Core executes native schema commands (`createOne`, `updateMany`, …) and plugin schema mutations (Soft Delete's
`softDeleteOne`, `restoreMany`, …) through two executors. The plugin executor (`runtime/schema-mutations/*`) shares the
final stage (`finalizeRuntimeOperationResult`) but copies or re-implements the rest: Access pre-check and row filter,
readable-result preparation and pre-image check, persistence-plan rewrite, outcome stages and result projection. Every
cross-cutting rule since ADR-0306 had to be wired twice, and 8 of the last 11 commits on the plugin path also touched the
native path.

The copies have diverged:

1. **Field `where` rules are skipped for many-row plugin commands (verified).** With `access: { read: { where: false } }`
   on `title`, `findMany({ where: { title: … } })` is refused, but `softDeleteMany({ where: { title: … } })` succeeds and
   its result reveals which rows match. Access runs its field-reference check only for native operations.
2. **The one-row plugin path drops relation predicates (inferred).** It keeps only the policy's row filter, so a policy
   with a relation filter fails with `INTERNAL_ERROR` on PostgreSQL instead of applying.
3. **The one-row plugin path skips the database capability assertions (inferred)** that the native path and many-row
   targeting run.
4. **Many-row plugin commands check readability once per row** instead of ADR-0306's single grouped query.

## Decision

1. **One owner per shared stage.** The plugin executor calls the same Core functions as the native executor for:
   - Access pre-check, row filter and relation predicates (`enforceRuntimeOperation`), and the database capability
     assertions;
   - the readable-result policy: one module decides which image is checked (pre-image for deletes and
     `checkReadable: 'before'`, result otherwise), skips `{ id }`-only results and Master, and runs one grouped check
     for collections;
   - the persistence-plan rewrite and the outcome stages (`enforceMutationOutcome`, `transformMutationOutcome`);
   - the `{ id }` default selection, through one helper used by every lowering site.
2. **What stays distinct, per ADR-0245.** A plugin mutation keeps its logical identity, its owner resolver instead of
   native input resolution and validation, and its fixed Runtime order. It is not lowered into the native command
   sequence.
3. **Access applies field `where` rules to plugin mutations.** A plugin mutation's targeting filter goes through the
   same field-reference check as a native operation's filter, as ADR-0316 decision 6 already requires.
4. **No public contract change.** Types, hovers, options and error codes stay. Behaviour changes only where the paths
   diverged: forbidden filters are refused (item 1), relation-filter policies apply to one-row plugin commands (item 2),
   and collections run one readability query (item 4).

## Consequences

- A future result or policy rule changes one module, not two executors.
- The fixes for items 1–3 are regression-tested: a forbidden field filter on `softDeleteMany`, a relation-filter policy
  on `softDeleteOne` (PostgreSQL), capability assertions on the one-row path, and one grouped readability query for a
  many-row plugin command.
- Which error wins when several refusals apply to a plugin mutation may change; every case still rolls back.
- **Documentation impact:** internal engineering documentation (Runtime docs and this record). The Access page already
  states that plugin commands follow the same rules.

## Implementation note (2026-10-17)

- Owners: `enforceRuntimeOperation` and `assertDatabaseRequestCapabilities` lock the one-row target;
  `prepareReadableResultHooks` (`runtime/enforcement/readable-results.ts`) decides the checked image for
  both executors; `compileDatabasePersistencePlan` takes the plugin mutation as its logical operation;
  `runMutationOutcomeStages` runs the outcome stages; `readWriteSelection` holds the `{ id }` default.
- Error precedence that changed, every case still rolling back: a plugin mutation's pre-image is checked
  right after its target is locked and item-checked, as a native delete's is, so an unreadable pre-image
  is refused before the owner resolver, Access re-evaluation and before Hooks run. A many-row command
  locks and item-checks every row before resolving the first, checks the pre-images with one query
  after the locks and the resulting rows with one query after the last row is finalized (after that
  row's final output restrictions).
- Test adapters that model a real database declare their filter operators (ADR-0301), which the
  one-row plugin path now asserts.

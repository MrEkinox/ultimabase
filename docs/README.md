# Documentation

- [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md): agreed product scope and semantics.
- [`current-architecture.md`](current-architecture.md): living concept index for
  maintained contracts, responsible code, focused tests and accepted ADRs.
- [Domain-specific agent rules](engineering/agent-domain-rules.md): mandatory
  domain instructions read only for the work in scope; global rules stay in AGENTS.
- [`RELEASING.md`](RELEASING.md): Changesets, prereleases, and npm publication.
- [`concepts/`](concepts/README.md): detailed conceptual contracts.
- [`adr/`](adr/README.md): current and superseded architectural decisions. The
  rebuild preserves every decision; accepted records remain in force.
- [`rebuild/`](rebuild/PROTOCOL.md): the package-by-package rebuild of the
  reference implementation: [protocol](rebuild/PROTOCOL.md),
  [behavior differences](rebuild/DIFFERENCES.md),
  [editor-visible parity audit](rebuild/DX-AUDIT.md),
  [validation correspondence](rebuild/VALIDATIONS.md), and the coordinator's
  [handoff](rebuild/HANDOFF.md) (in French).

Archive of the reference's development, kept unchanged:

- [`plans/`](plans/README.md): paused and completed cross-package plans of the
  reference, with the root `CURRENT_PLAN.md` as its last checkpoint.
- The implementation backlog in [`issues/`](../issues/README.md) and the
  removal log in `HISTORIQUE_SUPPRESSIONS.md` at the repository root.

Documentation describes current intent. ADRs explain why durable decisions were
made. Package `REBUILD*.md` files explain how the current modules map to the
reference. The archive explains how the reference was built; when it names an
internal module, it describes the reference layout.

# Documentation

- [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md): agreed product scope and semantics.
- [`current-architecture.md`](current-architecture.md): living concept index for
  maintained contracts, responsible code, focused tests and accepted ADRs.
- [Domain-specific agent rules](engineering/agent-domain-rules.md): mandatory
  domain instructions read only for the work in scope; global rules stay in AGENTS.
- [`RELEASING.md`](RELEASING.md): Changesets, prereleases, and npm publication.
- [`concepts/`](concepts/README.md): detailed conceptual contracts.
- [`adr/`](adr/README.md): current and superseded architectural decisions.
  Accepted records remain in force.
- [`rebuild/DIFFERENCES.md`](rebuild/DIFFERENCES.md): deliberate observable
  differences between the current implementation and the reference it was
  rebuilt from.

Documentation describes current intent. ADRs explain why durable decisions were
made; when one names an internal module, it describes the reference layout.
The development history is archived in Git: tag `reference-archive` holds the
reference's issue backlog, plans and removal log, and tag `rebuild-archive`
holds the rebuild protocol and per-package `REBUILD*.md` records.

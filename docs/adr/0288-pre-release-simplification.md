# ADR-0288: Simplify public contracts before the first release

- Status: proposed
- Date: 2026-10-08
- Refines: the "unchanged public contract" rule of the completed rebuild
- Approval: pending user validation

## Context

The package-by-package rebuild preserved every public contract of the
reference implementation, including its accidental complexity. Nothing is
published yet, so no external application or plugin depends on these
contracts. Three measured problems justify changing them now rather than after
a release freezes them:

- Writing an ordinary community plugin is too costly. A slug field, a
  write-time stamp, a schema option and a health route took 22 to 69 lines,
  up to 12 mandatory identifiers, Runtime AST casts and copies of undocumented
  official-plugin code; the same four plugins take 5 to 12 lines on a facade
  over the existing kernel. A plain `GET /health` route answers 401 without an
  application-id header.
- Core exports 1,118 names (220 values) and asks plugin authors to learn about
  forty concepts; several exported extension points have no consumer.
- Exact application types require a generation step that developers must
  remember to run.

## Decision

Until the first npm release, public APIs may change when a dedicated ADR
records the evidence, the new contract and the migration of every repository
consumer, and the user validates that ADR. The program runs in this order:

1. remove kernel extension points with no production consumer;
2. derive plugin privileges instead of asking authors to restate them;
3. add a small community authoring facade over the kernel, with the kernel
   fixes it needs (typed schema option reads, owner transforms of
   plugin-reserved fields, derived field Typegen metadata, derived
   contribution identities, public HTTP routes);
4. make Typegen generation automatic (command line, watch and check modes,
   project initializer), and run a bounded experiment of deferred by-value
   relationship targets that would make generation optional;
5. only then restructure larger Core mechanisms (Core-owned capability
   tokens, the command graph) when the earlier steps prove the gain.

## Preserved invariants

Every change keeps the global product and security invariants of `AGENTS.md`:
one operation engine, unforgeable Master authority that bypasses
authorization but not validation, hooks, transactions or constraints;
protected constraints that only narrow; automatic mutation transactions;
explicit plugin registration; immutable builders; optional Hooks, Access, ACL
and authentication plugins; no Active Record.

## Proof

Each change ships with its tests and documentation in the same change, passes
`yarn validate:full`, and attaches the DX audit against the previous `main`.
The audit no longer has to report zero differences; every reported difference
must be one the ADR announces.

## Consequences

`AGENTS.md` states that public contracts may change only through this process.
The roadmap's first-release section keeps the release tasks. After the first
release, public changes follow semantic versioning and Changesets instead of
this ADR.

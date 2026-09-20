# 3008: Compile one canonical command graph

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`
- Depends on: 3007
- ADR: decision from issue 3003

## Goal

Create one immutable compiled command representation from which execution,
developer surfaces, Typegen, and transports can derive least-authority views.

## Acceptance criteria

- [ ] One discriminated command graph represents application operations,
      request-authority schema mutations, and private Master administration
      without merging their distinct execution semantics.
- [ ] Each command records one canonical identity, owner, version, target,
      authority, payload and result facts, public errors, selected surfaces, and
      transport metadata.
- [ ] Executable callbacks and codecs remain private owner-bound references;
      immutable compiled and transport projections contain only their required
      inert facts.
- [ ] Duplicate names, owners, targets, surfaces, protocols, and bindings fail
      once during atomic graph compilation rather than in parallel registries.
- [ ] Core command compilation contains no product, Access, Hooks, REST,
      GraphQL, Yoga, database, or Typegen vocabulary.
- [ ] Existing operation and schema-mutation APIs temporarily adapt into this
      graph only for the bounded migrations in issues 3009 through 3012.

## Tests

- [ ] Graph compilation covers ownership, ordering, immutability, collisions,
      malformed JavaScript, multiple retained plugin instances, private
      callbacks, deterministic fingerprints, and application disposal.
- [ ] Public exports remain limited to the accepted plugin-author contract.

## Audit gate

- [ ] Audit the compiled graph for duplicated facts, leaked executables,
      product vocabulary, speculative fields, and parallel validation. Correct
      and repeat until every fact has one owner and one source of truth.
- [ ] Record graph shape, line, file, test, and Documentation impact evidence
      before completion.

## Out of scope

- Migrating a production operation or transport and removing legacy adapters.

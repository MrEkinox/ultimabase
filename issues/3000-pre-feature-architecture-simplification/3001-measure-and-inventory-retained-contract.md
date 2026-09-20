# 3001: Measure and inventory the retained contract

- Status: ready
- Milestone: 30
- Packages: repository-wide
- Depends on: none
- ADR: all accepted application, plugin, Runtime, transport, and Typegen ADRs

## Goal

Create a reproducible baseline of current product behavior, plugin powers,
public surface, code size, change fan-out, and validation cost before removing
or consolidating architecture.

## Acceptance criteria

- [ ] Inventory every public plugin power and classify it as production-used,
      required kernel invariant, test-only proof, or unused. A test or README
      example alone does not make a power production-used.
- [ ] Map each production-used power to its current official package, example,
      and Runtime consumer, including schema and field declarations, options,
      operations, schema mutations, policy, behavior, observers, transports,
      private storage, resources, and explicit plugin instances.
- [ ] Record candidate removals without changing code, including generic
      decoration and replacement, compiler and Runtime replacement, Typegen
      contribution levels, query extensions, and command families.
- [ ] Snapshot public exports, packed declarations, Typegen output, JavaScript
      no-Typegen behavior, direct TypeScript, REST, GraphQL, PostgreSQL, Master,
      Access, Hooks, ACL, Roles, Validation, Password Auth, and Soft Delete.
- [ ] Measure production and test lines and files, Core share, command
      representations, representative change fan-out, compilation, startup,
      heap, in-memory request cost, and local validation durations from one
      clean commit.
- [ ] Record the hosted CI reference separately from local measurements and do
      not extrapolate parallel job durations as elapsed workflow time.
- [ ] Change no Runtime behavior, public API, package export, or test threshold.

## Tests

- [ ] Backlog metadata, documentation links, formatting, and `git diff --check`
      pass.
- [ ] Baseline commands are repeatable and their environment and revision are
      recorded.

## Audit gate

- [ ] Audit the inventory against production imports, public exports, examples,
      generated contracts, and packed consumers; correct omissions and repeat
      the audit until no power is unclassified and no retained behavior lacks a
      baseline proof.
- [ ] Record the green audit and exactly one Documentation impact classification
      before completing the issue.

## Out of scope

- Removing an API, changing application concurrency, consolidating a registry,
  or beginning another milestone issue.

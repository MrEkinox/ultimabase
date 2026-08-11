# 1408: Let plugins contribute exact Typegen contracts

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1407
- ADR: ADR-0184, ADR-0187, ADR-0191, ADR-0192, ADR-0193

## Goal

Generate exact application declarations from the final plugin-transformed graph
and support controlled plugin-owned contracts that generic Typegen cannot derive.

## Acceptance criteria

- [ ] Generic Typegen renders plugin-added schemas, fields, options, models, handles, query extensions, operations, and public type references from the inert final snapshot.
- [ ] `typegen:reference`, `typegen:contribute`, and `typegen:emit` receive distinct privilege-scoped APIs; `typegen:replace` remains an exceptional critical privilege.
- [ ] Structured contributors can add imports, named declarations, and schema augmentations without mutating another owner's output or emitting raw text for representable contracts.
- [ ] Conditional Typegen contributions remain inactive when Typegen is absent, and JavaScript Runtime behavior is unchanged.
- [ ] Contributor identity, plugin version, static options, imports, output destinations, and contents participate in deterministic collision checks and fingerprints.
- [ ] First generation, stale generation, read-only production artifacts, atomic output, and application isolation remain supported without a generated Runtime client.
- [ ] `typegen:emit` accepts only `.d.ts` declarations or deterministic non-executable metadata and rejects JavaScript, binaries, callbacks, credentials, and Runtime-client output.

## Tests

- [ ] Snapshot and generator tests cover every contribution level, complex correlated types, names derived from static options, conflicts, malformed contributors, and reproducibility.
- [ ] Source and packed language-service tests cover autocomplete, hovers, unknown plugin surfaces, stale output, dynamic schema handles, and no `any`.

## Out of scope

- TypeScript compiler plugins or arbitrary source rewriting.
- Making Typegen necessary for JavaScript or Runtime execution.
- Large-schema editor performance measurement; paused issue 810 resumes that audit after milestone 15.

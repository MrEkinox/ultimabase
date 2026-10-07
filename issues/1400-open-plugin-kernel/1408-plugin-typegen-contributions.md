# 1408: Let plugins contribute exact Typegen contracts

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1407
- ADR: ADR-0184, ADR-0187, ADR-0191, ADR-0192, ADR-0193

## Goal

Generate exact application declarations from the final plugin-transformed graph
and support controlled plugin-owned contracts that generic Typegen cannot derive.

## Acceptance criteria

- [x] Generic Typegen renders plugin-added schemas, fields, options, models, handles, query extensions, operations, and public type references from the inert final snapshot.
- [x] `typegen:reference`, `typegen:contribute`, and `typegen:emit` receive distinct privilege-scoped APIs; `typegen:replace` remains an exceptional critical privilege.
- [x] Structured contributors can add imports, named declarations, and schema augmentations without mutating another owner's output or emitting raw text for representable contracts.
- [x] Conditional Typegen contributions remain inactive when Typegen is absent, and JavaScript Runtime behavior is unchanged.
- [x] Contributor identity, plugin version, static options, imports, output destinations, and contents participate in deterministic collision checks and fingerprints.
- [x] First generation, stale generation, read-only production artifacts, atomic output, and application isolation remain supported without a generated Runtime client.
- [x] `typegen:emit` accepts only `.d.ts` declarations or deterministic non-executable metadata and rejects JavaScript, binaries, callbacks, credentials, and Runtime-client output.

## Tests

- [x] Snapshot and generator tests cover every contribution level, complex correlated types, names derived from static options, conflicts, malformed contributors, and reproducibility.
- [x] Source and packed language-service tests cover autocomplete, hovers, unknown plugin surfaces, stale output, dynamic schema handles, and no `any`.

## Out of scope

- TypeScript compiler plugins or arbitrary source rewriting.
- Making Typegen necessary for JavaScript or Runtime execution.
- Large-schema editor performance measurement; paused issue 810 resumes that audit after milestone 15.
